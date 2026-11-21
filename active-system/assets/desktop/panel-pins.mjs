export const settingsPath = 'WebOS Settings.json';
export const defaultPanelPins = Object.freeze(['files']);
const schema = 'webos-panel-pins/1';
const maxBytes = 8192;
const appId = /^[a-zA-Z0-9][a-zA-Z0-9:-]{0,95}$/;
const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

function parse(bytes) {
  const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (value?.schema !== schema || !value.workspaces || Array.isArray(value.workspaces) ||
      typeof value.workspaces !== 'object' || Object.keys(value).length !== 2) {
    throw Error('WebOS Settings.json does not contain app bar settings.');
  }
  const overrides = new Map();
  for (const [key, pins] of Object.entries(value.workspaces)) {
    if (!/^[0-2]$/.test(key) || !Array.isArray(pins) || pins.length > 64 ||
        !pins.every(id => typeof id === 'string' && appId.test(id)) || new Set(pins).size !== pins.length) {
      throw Error('WebOS Settings.json contains an invalid app bar list.');
    }
    if (!same(pins, defaultPanelPins)) overrides.set(Number(key), pins);
  }
  return overrides;
}

export function createPanelPins(onChange) {
  const empty = loadContext => ({loadContext, overrides: new Map(), revision: undefined, tail: Promise.resolve()});
  let scope = empty(null);
  function run(operation) {
    const active = scope;
    const pending = active.tail.then(async () => {
      if (active !== scope) return;
      const context = active.loadContext ? await active.loadContext() : null;
      if (active !== scope || (context && !context.valid())) return;
      await operation(active, context, () => active === scope && (!context || context.valid()));
    });
    active.tail = pending.catch(() => {});
    return pending;
  }
  function accept(active, revision, overrides) {
    const changed = [0, 1, 2].some(i => !same(active.overrides.get(i) ?? defaultPanelPins, overrides.get(i) ?? defaultPanelPins));
    active.overrides = overrides;
    active.revision = revision;
    if (changed) onChange();
  }
  async function reload(active, context, valid) {
    let version;
    try { version = await context.files.version(settingsPath); }
    catch (error) { if (error.status !== 404) throw error; }
    if (!valid()) return;
    if (!version) {
      accept(active, null, new Map());
      return;
    }
    if (version.sha256 === active.revision) return;
    if (version.bytes > maxBytes) throw Error('WebOS Settings.json is too large for app bar settings.');
    const file = await context.files.read(settingsPath);
    if (!valid()) return;
    if (file.sha256 !== version.sha256 || file.data.byteLength !== version.bytes) {
      throw Error('WebOS Settings.json changed during refresh. Refresh again.');
    }
    accept(active, version.sha256, parse(file.data));
  }
  return {
    reset(loadContext) { scope = empty(loadContext); },
    pins(workspace) { return (scope.overrides.get(workspace) ?? defaultPanelPins).slice(); },
    refresh() { return run(async (active, context, valid) => { if (context) await reload(active, context, valid); }); },
    setPinned(workspace, app, pinned) {
      return run(async (active, context, valid) => {
        if (![0, 1, 2].includes(workspace) || typeof app !== 'string' || !appId.test(app)) throw Error('Invalid app bar entry.');
        if (context && active.revision === undefined) await reload(active, context, valid);
        if (!valid()) return;
        const old = active.overrides.get(workspace) ?? defaultPanelPins;
        const pins = pinned ? [...new Set([...old, app])] : old.filter(id => id !== app);
        if (same(old, pins)) return;
        if (pins.length > 64) throw Error('This workspace already has 64 app bar pins.');
        const overrides = new Map(active.overrides);
        if (same(pins, defaultPanelPins)) overrides.delete(workspace);
        else overrides.set(workspace, pins);
        let revision = null;
        if (context) {
          if (!overrides.size) {
            await context.files.remove(settingsPath, active.revision);
          } else {
            const data = JSON.stringify({schema, workspaces: Object.fromEntries(overrides)}, null, 2) + '\n';
            if (new TextEncoder().encode(data).length > maxBytes) throw Error('WebOS Settings.json would exceed its file size limit.');
            revision = (await context.files.write(settingsPath, data, active.revision)).sha256;
            if (!/^[0-9a-f]{64}$/.test(revision)) throw Error('The app bar settings save was not confirmed. Refresh Files.');
          }
        }
        if (valid()) accept(active, revision, overrides);
      });
    },
  };
}
