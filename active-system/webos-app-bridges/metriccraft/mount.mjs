const reportType = '.mcraft';
const sourceTypes = ['.csv', '.tsv', '.txt', '.xlsx', '.parquet'];
const types = [reportType, ...sourceTypes];
const revisionPattern = /^[a-f0-9]{64}$/;
const fileType = path => types.find(ext => path.toLowerCase().endsWith(ext));
const basename = path => path.split('/').at(-1);
const maxReport = 128 * 1024 * 1024;
const maxSource = 32 * 1024 * 1024;

function filename(name) {
  if (!name || name === '.' || name === '..' || /[\\/:\u0000-\u001f]/.test(name)) throw Error('Enter a valid file name.');
  return name;
}

function filesPath(value, folder = false) {
  if (typeof value !== 'string') throw Error('Choose a location in My files.');
  const path = value.replace(/^(?:(?:webos|browser):)?\//, '');
  if (folder && !path) return path;
  path.split('/').forEach(filename);
  if (path === '.app' || path.startsWith('.app/')) throw Error('Choose a folder outside app settings.');
  if (!folder && !fileType(path)) throw Error('Choose a MetricCraft report or a supported data file.');
  return path;
}

export function mount(host) {
  const owner = host.storage.workspaceOwner();
  const session = host.session();
  const lifetime = new AbortController();
  const signal = AbortSignal.any([lifetime.signal, host.signal]);
  const element = document.createElement('section');
  element.className = 'window-content metriccraft-workspace';
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./workspace.css', import.meta.url).href;
  const frame = document.createElement('iframe');
  frame.title = 'MetricCraft report editor';
  const footer = document.createElement('footer');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = 'Starting MetricCraft…';
  const legal = document.createElement('a');
  legal.href = new URL('./legal/NOTICES.txt', import.meta.url).href;
  legal.textContent = 'Source and licenses';
  legal.target = '_blank';
  legal.rel = 'noopener';
  footer.append(status, legal);
  element.append(style, frame, footer);

  const connected = Promise.withResolvers();
  connected.promise.catch(() => {});
  let context, editor, binding, releaseWriter, pulse;
  let busy = false, transferring = false;
  const timeout = setTimeout(() => connected.reject(Error('MetricCraft took too long to start.')), 60000);
  const tell = message => { if (!signal.aborted) status.textContent = message; };
  function valid() {
    return !signal.aborted && owner === host.storage.workspaceOwner() && session === host.session() && context?.valid();
  }
  function workspace() {
    if (!valid()) throw new DOMException('This Files workspace ended.', 'AbortError');
    if (transferring) throw Error('Files are being transferred.');
    return context.files;
  }
  function bind(next) {
    workspace();
    if (!binding && !next) return;
    host.desktop.updateAccountFileBinding(host.w, {owner, path: next?.path ?? null, sha256: next?.sha256 ?? null});
    binding = next;
  }
  function confirmDiscard() {
    workspace();
    if (!editor.dirty()) return true;
    return host.ui.confirm('Discard unsaved changes to the MetricCraft report?', {
      title: 'Unsaved changes', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true, signal,
    });
  }
  async function pick(extensions, foldersOnly = false) {
    workspace();
    const result = await host.storage.pickWorkspaceFile({extensions, foldersOnly, signal});
    workspace();
    return result == null ? null : filesPath(result, foldersOnly);
  }
  async function read(path, limit, expected) {
    const {data, sha256} = await workspace().read(path, {signal});
    workspace();
    if (!revisionPattern.test(sha256) || expected && sha256 !== expected) throw Error('Open the current revision from Files.');
    if (data.byteLength > limit) throw Error('Choose a file that is ' + limit / 1048576 + ' MiB or smaller.');
    return {data: new Uint8Array(data), sha256};
  }
  async function open(path, expected) {
    if (fileType(path) !== reportType) throw Error('Choose a .mcraft report.');
    const {data, sha256} = await read(path, maxReport, expected);
    if (!await confirmDiscard()) return;
    workspace();
    editor.open(data);
    bind({path, sha256});
    tell('Opened ' + basename(path) + ' from Files.');
  }
  function pickWorkbookItem(items) {
    if (!items.length) throw Error('No worksheets or tables were found.');
    const dialog = document.createElement('dialog');
    dialog.className = 'codi-confirm-dialog';
    dialog.setAttribute('aria-label', 'Import workbook data');
    const label = document.createElement('label');
    label.textContent = 'Worksheet or table';
    const select = document.createElement('select');
    items.forEach(([name, kind], index) => {
      select.add(new Option(name + ' (' + kind + ')', String(index)));
    });
    label.append(select);
    const actions = document.createElement('div');
    actions.className = 'codi-confirm-actions';
    dialog.append(label, actions);
    element.append(dialog);
    return new Promise((resolve, reject) => {
      function finish(item) {
        signal.removeEventListener('abort', cancel);
        dialog.close();
        dialog.remove();
        resolve(item);
      }
      const cancel = () => finish(null);
      actions.append(host.ui.textButton('Cancel', cancel), host.ui.textButton('Import', () => finish(items[Number(select.value)])));
      dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); }, {once: true});
      signal.addEventListener('abort', cancel, {once: true});
      if (signal.aborted) { cancel(); return; }
      try { dialog.showModal(); select.focus(); }
      catch (error) {
        signal.removeEventListener('abort', cancel);
        dialog.remove();
        reject(error);
      }
    });
  }
  async function importData(path) {
    const {data} = await read(path, maxSource);
    const name = basename(path);
    const item = fileType(path) === '.xlsx'
      ? await pickWorkbookItem(JSON.parse(editor.workbook_items(name, data)))
      : [];
    if (!item) return;
    workspace();
    editor.import(name, data, ...item);
    tell('Imported ' + name + ' from Files. Source data is included when you save.');
  }
  async function destination() {
    const folder = await pick([], true);
    if (folder == null) return null;
    const value = await host.ui.prompt('File name', {
      title: 'Save MetricCraft report', value: binding ? basename(binding.path) : 'Untitled.mcraft', confirmLabel: 'Save', signal,
    });
    if (value == null) return null;
    let name = filename(value.trim());
    if (!name.toLowerCase().endsWith(reportType)) name += reportType;
    return filesPath(folder ? folder + '/' + name : name);
  }
  async function save(asCopy) {
    const current = asCopy ? null : binding;
    const path = current?.path ?? await destination();
    if (!path) return;
    workspace();
    const revision = editor.revision();
    const bytes = new Uint8Array(editor.snapshot());
    let result;
    try {
      result = await workspace().write(path, bytes, current?.sha256 ?? null, {signal});
    } catch (error) {
      if (error.status !== 409) throw error;
      throw Error(current ? 'This report changed in Files. Use Save as to keep both versions.' :
        'A file already has that name. Choose another name.');
    }
    workspace();
    if (!revisionPattern.test(result.sha256)) throw Error('Files did not confirm the save.');
    bind({path, sha256: result.sha256});
    editor.saved(revision);
    tell('Saved ' + basename(path) + ' in Files.');
  }
  async function dispatch(action) {
    if (busy || transferring) return;
    busy = true;
    try {
      workspace();
      if (action === 'file.open') {
        const path = await pick([reportType]);
        if (path != null) await open(path);
      } else if (action === 'file.new') {
        if (!await confirmDiscard()) return;
        workspace();
        editor.new_document();
        bind(null);
        tell('New report.');
      } else if (action === 'home.getData') {
        const path = await pick(sourceTypes);
        if (path != null) await importData(path);
      } else if (action === 'file.save' || action === 'file.saveAs') {
        await save(action === 'file.saveAs');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') tell(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
      if (!signal.aborted) frame.contentDocument?.querySelector('canvas')?.focus();
    }
  }

  frame.metriccraftHost = {
    connect(value) {
      if (signal.aborted) { value.destroy(); return; }
      editor = value;
      connected.resolve();
    },
    fail(error) { connected.reject(Error(String(error))); },
  };
  signal.addEventListener('abort', () => {
    connected.reject(signal.reason);
    clearInterval(pulse);
    editor?.destroy();
  }, {once: true});

  const ready = (async () => {
    context = await host.storage.workspaceFileContext();
    if (context.owner !== owner) throw Error('The MetricCraft editor belongs to another Files workspace.');
    workspace();
    const launch = host.w.launchContext;
    frame.src = new URL('./native/index.html', import.meta.url).href;
    await connected.promise;
    workspace();
    releaseWriter = context.registerFileWriter?.(async () => {
      if (busy || editor.dirty()) throw Error('Finish saving the MetricCraft file before transferring Files.');
      transferring = true;
      frame.inert = true;
      return () => { frame.inert = false; transferring = false; };
    });
    if (launch) {
      if (launch.storage !== 'account' || launch.owner !== owner) throw Error('Open the report from My files.');
      await open(filesPath(launch.path), launch.restore ? undefined : launch.sha256);
    } else {
      tell('MetricCraft is ready.');
    }
    pulse = setInterval(() => {
      if (!valid() || busy || transferring) return;
      const action = editor.take_request();
      if (action) void dispatch(action);
    }, 100);
  })().finally(() => clearTimeout(timeout));
  ready.catch(error => tell(error.message));
  window.addEventListener('beforeunload', event => {
    let dirty = false;
    try { dirty = editor?.dirty(); } catch { dirty = true; }
    if (!dirty && !busy) return;
    event.preventDefault();
    event.returnValue = '';
  }, {signal});
  return {
    element,
    ready,
    focus: () => frame.contentDocument?.querySelector('canvas')?.focus(),
    async requestClose() {
      if (busy || transferring) {
        tell('Finish the file operation before closing MetricCraft.');
        return false;
      }
      if (!editor) return true;
      try { return await confirmDiscard(); }
      catch { return host.ui.confirm('Close the unavailable MetricCraft editor?', {confirmLabel: 'Close', signal}); }
    },
    dispose() {
      lifetime.abort();
      releaseWriter?.();
    },
  };
}
