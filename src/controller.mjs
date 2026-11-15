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
  const currentApplication = (instanceId, lifecycle) => !disposed && windows.has(instanceId) && !windows.get(instanceId).closing && hooks.get(instanceId) === lifecycle;
  async function applicationOperation(request, authority, operation) {
    check();
    if (authority === undefined || authority === null) throw Error('Explicit application caller required.');
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw Error('Explicit current application target required.');
    let captured, metadata;
    try {
      captured = structuredClone(request);
      const pending = [captured], seen = new WeakSet(); let fields = 0;
      while (pending.length) {
        const value = pending.pop();
        if (typeof value === 'number' && !Number.isFinite(value)) throw TypeError();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        if (typeof SharedArrayBuffer !== 'undefined' && (value instanceof SharedArrayBuffer || (ArrayBuffer.isView(value) && value.buffer instanceof SharedArrayBuffer))) throw TypeError();
        if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) continue;
        if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw TypeError();
        for (const child of Object.values(value)) { if (++fields > 65536) throw TypeError(); pending.push(child); }
      }
      metadata = JSON.stringify(captured);
    }
    catch { throw TypeError('Bounded cloneable application request required.'); }
    if (typeof metadata !== 'string' || metadata.length > 65536) throw TypeError('Application request metadata too large.');
    const allowed = operation === 'application.execute' ? ['desktopId', 'sessionId', 'instanceId', 'resourceId', 'request'] : ['desktopId', 'sessionId', 'instanceId', 'resourceId'];
    if (Object.keys(captured).some(key => !allowed.includes(key)) || captured.desktopId !== id || captured.sessionId !== sessionId || typeof captured.instanceId !== 'string' || captured.resourceId !== 'view:' + captured.instanceId) throw Error('Explicit current desktop, session and view resource target required.');
    if (operation === 'application.execute' && (!captured.request || typeof captured.request !== 'object' || Array.isArray(captured.request) || captured.request.instanceId !== captured.instanceId || captured.request.sessionId !== sessionId)) throw Error('Application command target must match its live view target.');
    const w = target(captured.instanceId), lifecycle = hooks.get(w.id), method = operation === 'application.inspect' ? 'inspect' : 'execute';
    if (!lifecycle || typeof lifecycle[method] !== 'function' || !currentApplication(w.id, lifecycle)) throw Error('Application view operation unavailable.');
    const decision = Object.freeze({desktopId: id, sessionId, accountId, instanceId: w.id, resourceId: captured.resourceId, appId: w.appId, operation,
      request: operation === 'application.execute' ? structuredClone(captured.request) : null});
    if (await authorize(authority, decision) !== true) throw Error('Application operation denied.');
    check();
    if (!currentApplication(w.id, lifecycle)) throw Error('Application view changed while authorization was pending.');
    // The component remains the sole owner of its live state and operations.
    // Structured cloning preserves immutable Blob input for explicit uploads.
    const result = await (method === 'inspect' ? lifecycle.inspect() : lifecycle.execute(captured.request, authority));
    if (!currentApplication(w.id, lifecycle)) {
      if (method === 'execute') throw Object.assign(Error('Application view changed while the command was pending; verify its outcome before retrying.'), {outcome: 'unknown'});
      throw Error('Application view changed while inspection was pending.');
    }
    return result;
  }
  return Object.freeze({inspect,
    inspectApplication(request, authority) { return applicationOperation(request, authority, 'application.inspect'); },
    executeApplication(request, authority) { return applicationOperation(request, authority, 'application.execute'); },
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
      check(); target(windowId); if (hooks.has(windowId)) throw Error('Window already has a view.');
      if (!lifecycle || typeof lifecycle !== 'object') throw TypeError('Application lifecycle callbacks required.');
      const owned = {};
      for (const name of ['dispose', 'requestClose', 'inspect', 'execute']) {
        const callback = lifecycle[name];
        if (callback !== undefined && typeof callback !== 'function') throw TypeError('Application lifecycle callbacks required.');
        owned[name] = callback;
      }
      // Replacing callbacks requires detaching the view, which invalidates
      // authorization decisions still pending against that view's lifecycle.
      hooks.set(windowId, Object.freeze(owned));
      return () => { if (hooks.get(windowId) === owned) hooks.delete(windowId); };
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const h of hooks.values()) h.dispose?.(); hooks.clear(); windows.clear(); focused = null; changed(); listeners.clear();
    }
  });
}
