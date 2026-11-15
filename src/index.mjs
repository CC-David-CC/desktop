import './style.css';
export {createDesktopController} from './controller.mjs';
const node = (tag, cls = '', text) => { const el = document.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el; };

/** One view of an explicitly owned Desktop session. Removing it does not sign out. */
export function mount({desktop, authority, displayName = '', onSignOut}) {
  if (!desktop || typeof desktop.execute !== 'function') throw TypeError('Desktop controller required.');
  const releaseView = desktop.attachView(), initial = desktop.inspect(), element = node('div', 'webos-desktop');
  const panel = node('nav', 'webos-panel'), launcher = node('div', 'webos-launcher'), tasks = node('div', 'webos-tasks'), space = node('div', 'webos-workspaces');
  const area = node('main', 'webos-window-area'), status = node('div', 'webos-desktop-status'), mounts = new Map();
  let disposed = false, last = initial, z = 1;
  panel.setAttribute('aria-label', 'Desktop'); area.setAttribute('aria-label', 'Workspace'); status.setAttribute('role', 'status');
  function failure(error) { if (!disposed) status.textContent = error.message || String(error); }
  const execute = (operation, args = {}) => desktop.execute({desktopId: initial.desktopId, sessionId: initial.sessionId, operation, args}, authority);
  const run = (operation, args) => execute(operation, args).catch(failure);
  const button = (label, action, cls = '') => { const b = node('button', cls, label); b.type = 'button'; b.addEventListener('click', action); return b; };
  const appButton = button('APPs', () => { launcher.hidden = !launcher.hidden; }); appButton.setAttribute('aria-label', 'Applications');
  for (const app of initial.applications) {
    const launch = button(app.title, () => { launcher.hidden = true; run('open', {appId: app.id}); }, 'webos-launch'); launch.dataset.appId = app.id; launcher.append(launch);
  }
  launcher.hidden = true;
  panel.append(appButton, tasks, space, node('span', 'webos-account', displayName));
  if (onSignOut) panel.append(button('Sign out', () => Promise.resolve().then(onSignOut).catch(failure), 'webos-signout'));
  element.append(area, panel, launcher, status);
  function remove(id) {
    const record = mounts.get(id); if (!record) return;
    mounts.delete(id); record.controller.abort(); record.detach?.();
    try { record.view?.dispose(); } catch (error) { failure(error); }
    record.element.remove();
  }
  function makeWindow(w) {
    const controller = new AbortController(), win = node('section', 'webos-window'), titlebar = node('header', 'webos-titlebar'), title = node('span', '', w.title), controls = node('div', 'webos-window-controls');
    win.dataset.windowId = w.id; win.setAttribute('aria-label', w.title); win.tabIndex = -1;
    for (const [label, glyph, op] of [['Minimize', '−', 'minimize'], ['Maximize', '□', 'maximize'], ['Close', '×', 'close']]) {
      const b = button(glyph, e => { e.stopPropagation(); run(op, {windowId: w.id}); }); b.setAttribute('aria-label', label); controls.append(b);
    }
    titlebar.append(title, controls); win.append(titlebar); area.append(win);
    const content = node('div', 'webos-window-content', 'Loading…'); win.append(content);
    const record = {element: win, controller, view: null, phase: 'loading', detach: null}; mounts.set(w.id, record);
    record.detach = desktop.attachWindow(w.id, {dispose: () => remove(w.id),
      inspect: () => {
        if (record.phase !== 'ready' || typeof record.view?.inspect !== 'function') throw Error('Application inspection is not ready.');
        return record.view.inspect();
      },
      execute: (request, authority) => {
        if (record.phase !== 'ready' || typeof record.view?.execute !== 'function') throw Error('Application operations are not ready.');
        return record.view.execute(request, authority);
      }, requestClose: async () => {
      if (record.phase === 'loading') return true;
      if (record.view?.requestClose) return await record.view.requestClose();
      if (record.view?.inspect?.().dirty) { failure(Error('This application has unsaved changes. Save or discard them before closing.')); return false; }
      return true;
    }});
    win.addEventListener('pointerdown', () => { if (last.focused !== w.id) run('focus', {windowId: w.id}); });
    titlebar.addEventListener('dblclick', e => { if (!e.target.closest('button')) run('maximize', {windowId: w.id}); });
    function drag(handle, resize) {
      handle.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const current = last.windows.find(item => item.id === w.id); if (!current || current.maximized) return;
        e.preventDefault(); handle.setPointerCapture(e.pointerId);
        const start = {pointerX: e.clientX, pointerY: e.clientY, ...current.rect}; let next = {...current.rect};
        const move = event => {
          const dx = event.clientX - start.pointerX, dy = event.clientY - start.pointerY;
          next = resize ? {...current.rect, width: Math.max(240, Math.min(area.clientWidth, start.width + dx)), height: Math.max(120, Math.min(area.clientHeight, start.height + dy))}
            : {...current.rect, x: Math.max(0, Math.min(Math.max(0, area.clientWidth - 100), current.rect.x + dx)), y: Math.max(0, Math.min(Math.max(0, area.clientHeight - 40), current.rect.y + dy))};
          // Pointer geometry is a visual preview; the same domain move commits it on release.
          Object.assign(win.style, {left: next.x + 'px', top: next.y + 'px', width: next.width + 'px', height: next.height + 'px'});
        };
        const end = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', cancel); handle.removeEventListener('lostpointercapture', cancel); run('move', {windowId: w.id, rect: next}); };
        const cancel = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', cancel); handle.removeEventListener('lostpointercapture', cancel); render(desktop.inspect()); };
        handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', cancel); handle.addEventListener('lostpointercapture', cancel);
      }, {signal: controller.signal});
    }
    drag(titlebar, false); const grip = node('div', 'webos-resize'); grip.setAttribute('aria-label', 'Resize window'); win.append(grip); drag(grip, true);
    try {
      const app = desktop.application(w.appId);
      const view = app.mount({instanceId: w.id, sessionId: initial.sessionId, resource: structuredClone(w.resource), signal: controller.signal});
      if (!view || typeof view.then === 'function' || !(view.element instanceof HTMLElement) || typeof view.dispose !== 'function') throw TypeError('App mount must synchronously return {element,dispose}.');
      record.view = view; content.replaceChildren(view.element);
      Promise.resolve(view.ready).then(() => { if (!controller.signal.aborted) { record.phase = 'ready'; win.dataset.phase = 'ready'; } }, error => {
        if (!controller.signal.aborted) { record.phase = 'failed'; win.dataset.phase = 'failed'; content.replaceChildren(node('p', 'webos-load-error', 'Could not load ' + w.title + ': ' + error.message)); }
      });
    } catch (error) { record.phase = 'failed'; win.dataset.phase = 'failed'; content.replaceChildren(node('p', 'webos-load-error', 'Could not load ' + w.title + ': ' + error.message)); }
    return record;
  }
  function render(state) {
    if (disposed) return; last = state;
    if (state.disposed) { dispose(); return; }
    for (const id of mounts.keys()) if (!state.windows.some(w => w.id === id)) remove(id);
    for (const w of state.windows) {
      const record = mounts.get(w.id) || makeWindow(w), win = record.element;
      win.hidden = w.minimized || w.workspace !== state.workspace; win.classList.toggle('webos-focused', w.id === state.focused); win.classList.toggle('webos-maximized', w.maximized);
      if (w.id === state.focused) win.style.zIndex = ++z;
      Object.assign(win.style, {left: w.rect.x + 'px', top: w.rect.y + 'px', width: w.rect.width + 'px', height: w.rect.height + 'px'});
    }
    tasks.replaceChildren(...state.windows.filter(w => w.workspace === state.workspace).map(w => { const b = button(w.title, () => run('focus', {windowId: w.id}), 'webos-task'); b.setAttribute('aria-pressed', String(w.id === state.focused && !w.minimized)); b.dataset.windowId = w.id; return b; }));
    space.replaceChildren(...Array.from({length: state.workspaceCount}, (_, index) => { const b = button(String(index + 1), () => run('workspace', {index})); b.setAttribute('aria-label', 'Workspace ' + (index + 1)); b.setAttribute('aria-pressed', String(index === state.workspace)); return b; }));
  }
  const unsubscribe = desktop.subscribe(render);
  function dispose() { if (disposed) return; disposed = true; unsubscribe(); for (const id of [...mounts.keys()]) remove(id); releaseView(); element.remove(); }
  try { render(initial); } catch (error) { dispose(); throw error; }
  return Object.freeze({element, dispose, ready: Promise.resolve(), inspect: () => ({disposed, desktopId: initial.desktopId, sessionId: initial.sessionId}), execute});
}
