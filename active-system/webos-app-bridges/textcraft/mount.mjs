// SPDX-License-Identifier: GPL-3.0-or-later

const revision = /^[a-f0-9]{64}$/;
const invalidName = /[/\\:\u0000-\u001f]/;

function element(tag, properties) {
  return Object.assign(document.createElement(tag), properties);
}

function nameOf(path) {
  return path.split('/').at(-1);
}

function workspacePath(path, root = false) {
  if (typeof path !== 'string') throw Error('Choose a file in My files.');
  const relative = path.replace(/^(?:browser:)?\//, '');
  if (root && !relative) return '';
  if (relative.split('/').some(part => !part || part === '.' || part === '..' || invalidName.test(part))) {
    throw Error('Choose a file in My files.');
  }
  if (relative === '.app' || relative.startsWith('.app/')) throw Error('Choose a folder outside TextCraft settings.');
  return relative;
}

function virtual(path) {
  return 'browser:/' + path;
}

export function mount(host) {
  const launch = host.w.launchContext;
  const owner = host.storage.workspaceOwner();
  const session = host.session();
  const controller = new AbortController();
  const {signal} = controller;
  const root = element('section', {className: 'window-content textcraft-workspace'});
  const view = element('iframe', {title: 'TextCraft', allow: 'clipboard-read; clipboard-write'});
  view.inert = Boolean(launch);
  const status = element('p', {textContent: 'Starting TextCraft…'});
  status.setAttribute('role', 'status');
  root.append(element('link', {rel: 'stylesheet', href: new URL('./workspace.css', import.meta.url).href}), view, status);

  const folders = new Set(['']);
  let context, unregister, binding, initialFile, initialPath;
  let editorReady = false;
  let dirty = false;
  let transferring = false;
  let writes = Promise.resolve();
  let startResolve, startReject;
  const start = new Promise((resolve, reject) => {
    startResolve = resolve;
    startReject = reject;
  });
  const timer = setTimeout(() => startReject(Error('TextCraft took too long to start.')), 90000);
  signal.addEventListener('abort', () => startReject(signal.reason), {once: true});
  start.catch(() => {});

  function finishStart() {
    if (editorReady && (!launch || binding?.path === initialPath)) startResolve();
  }

  function check() {
    if (signal.aborted || host.session() !== session || host.storage.workspaceOwner() !== owner || !context?.valid()) {
      throw new DOMException('This Files session ended.', 'AbortError');
    }
    if (transferring) throw Error('Files are being transferred.');
  }

  async function list(path) {
    check();
    const result = await context.files.list(path, {signal});
    check();
    return result.entries.filter(entry => !entry.deleted);
  }

  async function read(path) {
    check();
    const result = await context.files.read(path, {signal});
    check();
    if (!revision.test(result.sha256)) throw Error('Files returned an invalid revision.');
    return {name: nameOf(path), path: virtual(path), bytes: result.data, sha256: result.sha256};
  }

  async function ensureFolders(path) {
    let folder = '';
    for (const part of path.split('/').slice(0, -1)) {
      const parent = folder;
      folder = folder ? folder + '/' + part : part;
      if (folders.has(folder)) continue;
      const found = async () => (await list(parent)).some(entry => entry.directory && entry.name === part);
      if (!await found()) {
        try {
          await context.files.mkdir(folder, {signal});
        } catch (error) {
          if (error?.status !== 409 || !await found()) throw error;
        }
      }
      folders.add(folder);
    }
  }

  function persist(path, bytes, base) {
    const receipt = writes.then(async () => {
      check();
      const target = workspacePath(path);
      if (base !== null && !revision.test(base)) throw Error('This document has an invalid Files revision.');
      await ensureFolders(target);
      let result;
      try {
        result = await context.files.write(target, new Blob([bytes], {type: 'application/octet-stream'}), base, {signal});
      } catch (error) {
        if (error?.status === 409) throw Error('This file already exists or changed. Save As under a new name to keep both copies.');
        throw error;
      }
      check();
      if (!revision.test(result.sha256)) throw Error('Files did not confirm the save.');
      return result.sha256;
    });
    writes = receipt.catch(() => {});
    return receipt;
  }

  view.textcraftFiles = {
    onOpen(callback) {
      if (initialFile) {
        const file = initialFile;
        initialFile = undefined;
        callback(file);
      }
    },
    ready() {
      editorReady = true;
      finishStart();
    },
    failed(message) { startReject(Error(message)); },
    setUnsaved(value) { dirty = value; },
    status(message) { if (!signal.aborted) status.textContent = message; },
    close() { host.desktop.requestWindowClose?.(host.w); },
    async open(types) {
      check();
      const selected = await host.storage.pickWorkspaceFile({extensions: types.map(type => '.' + type), signal});
      if (!selected) return null;
      const file = await read(workspacePath(selected));
      status.textContent = 'Opened ' + file.name;
      return file;
    },
    async readOpen(path) {
      const file = await read(workspacePath(path));
      status.textContent = 'Opened ' + file.name;
      return file;
    },
    async saveAs(name, extension) {
      check();
      const selected = await host.storage.pickWorkspaceFile({foldersOnly: true, signal});
      if (selected == null) return null;
      const choice = await host.ui.prompt('File name', {title: 'Save TextCraft document', value: name, confirmLabel: 'Save', signal});
      if (choice == null) return null;
      check();
      let filename = choice.trim();
      if (!filename || invalidName.test(filename) || filename === '.' || filename === '..') throw Error('Enter a file name.');
      if (!filename.includes('.')) filename += extension;
      const parent = workspacePath(selected, true);
      return {path: virtual(parent ? parent + '/' + filename : filename)};
    },
    persist,
    bind(path, sha256) {
      check();
      const target = path == null ? null : workspacePath(path);
      if (target && !revision.test(sha256)) throw Error('This document has an invalid Files revision.');
      binding = target == null ? undefined : {path: target, sha256};
      host.desktop.updateAccountFileBinding(host.w, {owner, path: target, sha256: binding?.sha256 ?? null});
      finishStart();
    },
  };

  const ready = (async () => {
    context = await host.storage.workspaceFileContext();
    check();
    if (context.owner !== owner) throw Error('This editor belongs to another Files workspace.');
    if (launch) {
      if (launch.storage !== 'account' || launch.owner !== owner) throw Error('Open the session from My files.');
      initialPath = workspacePath(launch.path);
      status.textContent = 'Opening ' + nameOf(initialPath) + '…';
      initialFile = await read(initialPath);
      if (!launch.restore && launch.sha256 && launch.sha256 !== initialFile.sha256) {
        throw Error('The session changed in Files. Open its current revision.');
      }
    }
    view.src = new URL('./native/index.html', import.meta.url).href;
    await start;
    check();
    unregister = context.registerFileWriter?.(async () => {
      await writes;
      if (dirty) throw Error('Save the TextCraft session before transferring Files.');
      transferring = true;
      view.inert = true;
      return () => {
        transferring = false;
        view.inert = false;
      };
    });
    view.inert = false;
    status.textContent = launch ? 'Opened ' + nameOf(initialPath) : 'TextCraft is ready';
  })().finally(() => clearTimeout(timer));
  ready.catch(error => { if (!signal.aborted) status.textContent = error.message; });

  return {
    element: root,
    ready,
    focus: () => view.focus(),
    inspect: () => ({path: binding?.path ?? null, dirty}),
    async requestClose() {
      await writes;
      return !dirty || host.ui.confirm('Discard unsaved changes to TextCraft documents?', {confirmLabel: 'Discard', signal});
    },
    dispose() {
      controller.abort();
      unregister?.();
    },
  };
}
