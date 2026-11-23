const types = ['.projectcraft', '.xml', '.csv'];
const revisionPattern = /^[a-f0-9]{64}$/;
const fileType = path => types.find(ext => path.toLowerCase().endsWith(ext));
const basename = path => path.split('/').at(-1);
const maxBytes = 128 * 1024 * 1024;

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
  if (!folder && !fileType(path)) throw Error('Choose a ProjectCraft, XML, or CSV file.');
  return path;
}

export function mount(host) {
  const owner = host.storage.workspaceOwner();
  const session = host.session();
  const lifetime = new AbortController();
  const signal = AbortSignal.any([lifetime.signal, host.signal]);
  const element = document.createElement('section');
  element.className = 'window-content projectcraft-workspace';
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./workspace.css', import.meta.url).href;
  const frame = document.createElement('iframe');
  frame.title = 'ProjectCraft Gantt editor';
  const footer = document.createElement('footer');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  status.textContent = 'Starting ProjectCraft…';
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
  const timeout = setTimeout(() => connected.reject(Error('ProjectCraft took too long to start.')), 60000);
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
    return host.ui.confirm('Discard unsaved changes to the ProjectCraft project?', {
      title: 'Unsaved changes', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true, signal,
    });
  }
  async function pick(foldersOnly = false) {
    workspace();
    const result = await host.storage.pickWorkspaceFile({extensions: foldersOnly ? [] : types, foldersOnly, signal});
    workspace();
    return result == null ? null : filesPath(result, foldersOnly);
  }
  async function open(path, expected) {
    const {data, sha256} = await workspace().read(path, {signal});
    workspace();
    if (!revisionPattern.test(sha256) || expected && sha256 !== expected) throw Error('Open the current revision from Files.');
    if (data.byteLength > maxBytes) throw Error('Project files must be 128 MiB or smaller.');
    if (!await confirmDiscard()) return;
    workspace();
    editor.open(basename(path), data);
    const project = fileType(path) === '.projectcraft';
    bind(project ? {path, sha256} : null);
    tell((project ? 'Opened ' : 'Imported ') + basename(path) + ' from Files.');
  }
  async function destination(wanted, ext) {
    const folder = await pick(true);
    if (folder == null) return null;
    const value = await host.ui.prompt('File name', {
      title: 'Save ProjectCraft file', value: wanted, confirmLabel: 'Save', signal,
    });
    if (value == null) return null;
    let name = filename(value.trim());
    const provided = fileType(name);
    if (provided && provided !== ext) throw Error('Use the ' + ext + ' extension for this file.');
    if (!provided) name += ext;
    return filesPath(folder ? folder + '/' + name : name);
  }
  async function save(asCopy, format) {
    const ext = format === 'mspdi' ? '.xml' : format === 'csv' ? '.csv' : '.projectcraft';
    const current = !asCopy && !format ? binding : null;
    const suggestion = editor.suggested_name().replace(/\.projectcraft$/i, '') + ext;
    const path = current?.path ?? await destination(suggestion, ext);
    if (!path) return;
    const snapshot = format ? editor.export(format) : editor.snapshot();
    const bytes = new TextEncoder().encode(snapshot);
    if (bytes.length > maxBytes) throw Error('Project files must be 128 MiB or smaller.');
    let result;
    try {
      result = await workspace().write(path, bytes, current?.sha256 ?? null, {signal});
    } catch (error) {
      if (error.status !== 409) throw error;
      throw Error(current ? 'This project changed in Files. Use Save As to keep both versions.' :
        'A file already has that name. Choose another name.');
    }
    workspace();
    if (!revisionPattern.test(result.sha256)) throw Error('Files did not confirm the save.');
    if (!format) {
      editor.saved(basename(path), snapshot);
      bind({path, sha256: result.sha256});
    }
    tell((format ? 'Exported ' : 'Saved ') + basename(path) + ' in Files.');
  }
  async function dispatch(action) {
    if (busy || transferring) return;
    busy = true;
    try {
      workspace();
      if (action === 'open') {
        const path = await pick();
        if (path != null) await open(path);
      } else if (action === 'save' || action === 'save-as') {
        await save(action === 'save-as');
      } else if (action === 'export-mspdi' || action === 'export-csv') {
        await save(true, action.slice(7));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') tell(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
      if (!signal.aborted) frame.contentDocument?.querySelector('canvas')?.focus();
    }
  }

  frame.projectcraftHost = {
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
    if (context.owner !== owner) throw Error('The ProjectCraft editor belongs to another Files workspace.');
    workspace();
    const launch = host.w.launchContext;
    frame.src = new URL('./native/index.html', import.meta.url).href;
    await connected.promise;
    workspace();
    releaseWriter = context.registerFileWriter?.(async () => {
      if (busy || editor.dirty()) throw Error('Finish saving the ProjectCraft file before transferring Files.');
      transferring = true;
      frame.inert = true;
      return () => { frame.inert = false; transferring = false; };
    });
    if (launch) {
      if (launch.storage !== 'account' || launch.owner !== owner) throw Error('Open the project from My files.');
      await open(filesPath(launch.path), launch.restore ? undefined : launch.sha256);
    } else {
      tell('ProjectCraft is ready.');
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
        tell('Finish the file operation before closing ProjectCraft.');
        return false;
      }
      if (!editor) return true;
      try { return await confirmDiscard(); }
      catch { return host.ui.confirm('Close the unavailable ProjectCraft editor?', {confirmLabel: 'Close', signal}); }
    },
    dispose() {
      lifetime.abort();
      releaseWriter?.();
    },
  };
}
