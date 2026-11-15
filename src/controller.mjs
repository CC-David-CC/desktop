/** Desktop owns window/workspace state; app documents and account services have other owners. */
export function createDesktopController({sessionId, accountId, applications, authorize, workspaceCount = 3}) {
  if (!sessionId || !accountId || typeof authorize !== 'function' || !Array.isArray(applications)) throw TypeError('Explicit session, account, applications and authorization required.');
  if (!Number.isSafeInteger(workspaceCount) || workspaceCount < 1 || workspaceCount > 16) throw TypeError('Invalid workspace count.');
  const id = crypto.randomUUID(), apps = new Map(), windows = new Map(), hooks = new Map(), listeners = new Set(), focusByWorkspace = new Map();
  let workspace = 0, focused = null, disposed = false, revision = 0, viewAttached = false;
  for (const app of applications) {
    if (!app || typeof app.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(app.id) || typeof app.title !== 'string' || typeof app.mount !== 'function' || apps.has(app.id)) throw TypeError('Unique application descriptor required.');
    apps.set(app.id, Object.freeze({...app}));
  }
  const check = () => { if (disposed) throw new DOMException('Desktop session ended.', 'AbortError'); };
  const inspect = () => Object.freeze({desktopId: id, sessionId, accountId, disposed, revision, workspace, workspaceCount, focused,
    applications: [...apps.values()].map(({id, title}) => ({id, title})), windows: structuredClone([...windows.values()])});
  const changed = () => { revision++; const snapshot = inspect(); for (const listener of [...listeners]) listener(snapshot); };
  const target = windowId => { const w = windows.get(windowId); if (!w) throw Error('Window no longer exists.'); return w; };
  function focus(w) { workspace = w.workspace; w.minimized = false; focused = w.id; focusByWorkspace.set(workspace, w.id); }
  const operations = Object.freeze({
    open({appId, resource = null}) {
      const app = apps.get(appId); if (!app) throw Error('Application is unavailable.');
      // Only bounded JSON resource identity is shared with a view, never privileged host state.
      const json = JSON.stringify(resource); if (json === undefined || json.length > 8192) throw TypeError('Bounded resource identity required.');
      const resourceIdentity = JSON.parse(json), windowId = crypto.randomUUID(), offset = (windows.size % 6) * 28;
      const w = {id: windowId, appId, title: app.title, workspace, minimized: false, maximized: false, closing: false, resource: resourceIdentity,
        rect: {x: 24 + offset, y: 24 + offset, width: app.width || 860, height: app.height || 620}};
      windows.set(windowId, w); focus(w); changed(); return {status: 'opened', windowId};
    },
    focus({windowId}) { focus(target(windowId)); changed(); return {status: 'focused'}; },
    workspace({index}) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= workspaceCount) throw TypeError('Unknown workspace.');
      workspace = index; focused = [...windows.values()].find(w => w.id === focusByWorkspace.get(index) && !w.minimized)?.id
        || [...windows.values()].find(w => w.workspace === index && !w.minimized)?.id || null;
      changed(); return {status: 'selected'};
    },
    move({windowId, rect}) {
      const w = target(windowId);
      if (!rect || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k])) || rect.width < 240 || rect.height < 120 || Object.values(rect).some(v => Math.abs(v) > 100000)) throw TypeError('Valid window rectangle required.');
      w.rect = {x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height}; w.maximized = false; changed(); return {status: 'moved'};
    },
    minimize({windowId}) { const w = target(windowId); w.minimized = true; if (focused === w.id) focused = null; changed(); return {status: 'minimized'}; },
    maximize({windowId}) { const w = target(windowId); w.maximized = !w.maximized; focus(w); changed(); return {status: 'resized'}; },
    async close({windowId}) {
      const w = target(windowId); if (w.closing) return {status: 'pending'};
      w.closing = true; changed();
      try {
        const allowed = await (hooks.get(windowId)?.requestClose?.() ?? true); check();
        if (!windows.has(windowId)) return {status: 'closed'};
        if (allowed !== true) return {status: 'cancelled'};
        windows.delete(windowId); const lifecycle = hooks.get(windowId); hooks.delete(windowId); lifecycle?.dispose?.();
        if (focused === windowId) focused = null;
        return {status: 'closed'};
      } finally { if (!disposed) { w.closing = false; changed(); } }
    }
  });
  return Object.freeze({inspect,
    subscribe(listener) { check(); listeners.add(listener); return () => listeners.delete(listener); },
    async execute(request, authority) {
      check();
      if (!request || request.desktopId !== id || request.sessionId !== sessionId || !Object.hasOwn(operations, request.operation)) throw Error('Explicit current desktop and session target required.');
      const raw = JSON.stringify(request); if (raw.length > 16384) throw TypeError('Operation request too large.');
      const captured = JSON.parse(raw);
      if (await authorize(authority, Object.freeze(captured)) !== true) throw Error('Desktop operation denied.');
      check(); return operations[captured.operation](captured.args || {});
    },
    attachView() { check(); if (viewAttached) throw Error('This Desktop already has a mounted view.'); viewAttached = true; return () => { viewAttached = false; }; },
    application(appId) { check(); return apps.get(appId); },
    attachWindow(windowId, lifecycle) {
      check(); target(windowId); if (hooks.has(windowId)) throw Error('Window already has a view.'); hooks.set(windowId, lifecycle);
      return () => { if (hooks.get(windowId) === lifecycle) hooks.delete(windowId); };
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const h of hooks.values()) h.dispose?.(); hooks.clear(); windows.clear(); focused = null; changed(); listeners.clear();
    }
  });
}
