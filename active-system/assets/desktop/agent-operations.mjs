import {strictJson} from '../../network/strict-json.mjs';

const sameTarget = (a, b) => a.instanceId === b.instanceId && a.sessionId === b.sessionId &&
  a.documentId === b.documentId && a.resourceId === b.resourceId;
const sameBinding = (a, b) => sameTarget(a, b) && a.bindingId === b.bindingId;
const fields = (object, names) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).length === names.length && names.every(name => Object.hasOwn(object, name));
const sameSet = (array, wanted) => Array.isArray(array) && array.length === wanted.length &&
  wanted.every(item => array.includes(item));
const missing = () => Error('The approved document is no longer available in this desktop.');

export function createDesktopAgentOperations({owner, confirm, thumbprint}) {
  const desktopId = crypto.randomUUID();
  const views = new Map();
  let approvalOpen = false;

  function register(entry) {
    if (entry.signal.aborted || views.has(entry.instanceId)) throw missing();
    views.set(entry.instanceId, entry);
    const remove = () => {
      entry.signal.removeEventListener('abort', remove);
      if (views.get(entry.instanceId) === entry) views.delete(entry.instanceId);
    };
    entry.signal.addEventListener('abort', remove, {once: true});
    return remove;
  }

  function requireLive(authority, entry) {
    authority.check();
    if (!entry || views.get(entry.instanceId) !== entry || entry.signal.aborted ||
        entry.sessionId !== authority.sessionId || entry.accountId !== authority.accountId) throw missing();
  }

  async function document(authority, entry) {
    requireLive(authority, entry);
    const value = await entry.snapshot();
    requireLive(authority, entry);
    if (!value || value.instanceId !== entry.instanceId || value.sessionId !== entry.sessionId ||
        typeof value.documentId !== 'string' || !value.documentId ||
        typeof value.resourceId !== 'string' || !value.resourceId ||
        typeof value.bindingId !== 'string' || !value.bindingId) throw missing();
    return {instanceId:value.instanceId, sessionId:value.sessionId,
      documentId:value.documentId, resourceId:value.resourceId,bindingId:value.bindingId};
  }

  const target = entry => ({desktopId, instanceId:entry.instanceId,
    sessionId:entry.sessionId, resourceId:'view:'+entry.instanceId});
  const resourcesFor = (entry, doc) => [target(entry).resourceId, 'binding:'+doc.bindingId, doc.resourceId];

  async function approve({instanceId, agentKey, commands, seconds} = {}) {
    const authority = owner();
    if (typeof instanceId !== 'string' || !Number.isInteger(seconds) || seconds < 1 || seconds > 900 ||
        !Array.isArray(commands) || !commands.length || commands.length > 32 ||
        new Set(commands).size !== commands.length) throw Error('Choose one window, commands and a duration of 1 to 900 seconds.');
    const selected = [...commands];
    const key = structuredClone(agentKey);
    const entry = views.get(instanceId);
    requireLive(authority, entry);
    if (!selected.every(command => Object.hasOwn(entry.commands, command))) throw Error('Unsupported delegated command.');
    if (approvalOpen) throw Error('Finish the open operation approval first.');
    approvalOpen = true;
    try {
      const [doc, fingerprint] = await Promise.all([document(authority, entry), thumbprint(key)]);
      const scope = {desktopId, sessionId:doc.sessionId, instanceId:doc.instanceId,
        resources:resourcesFor(entry, doc), commands:selected};
      const approved = await confirm(
        'Agent key ' + fingerprint + ' can run ' + selected.join(', ') + ' on ' + entry.name +
        ' document ' + doc.resourceId + ' in window ' + entry.windowId +
        ' (' + doc.instanceId + ') for ' + seconds + ' seconds. ' +
        'Edits follow the document’s current recovery and AutoSave settings.',
        {title:'Approve document operations',confirmLabel:'Approve access',
          signal:AbortSignal.any([entry.signal, AbortSignal.timeout(90_000)]),requireTrustedClick:true});
      if (!approved) throw Error('Document operation access was cancelled.');
      if (!sameBinding(doc, await document(authority, entry))) throw missing();
      const grant = await authority.approve({agentKey:key, scope, seconds});
      try {
        if (!sameBinding(doc, await document(authority, entry))) throw missing();
      } catch (error) {
        // No credential has been returned. Remove the now inaccessible grant if the account still permits it.
        await authority.revoke(grant.id).catch(() => {});
        throw error;
      }
      const {bindingId, ...documentTarget} = doc;
      return {grant, target:target(entry), document:documentTarget};
    } finally { approvalOpen = false; }
  }

  async function dispatch({confirmation, intent} = {}) {
    const authority = owner();
    if (typeof confirmation !== 'string' || !confirmation || confirmation.length > 8192) {
      throw Error('A signed one-use operation grant is required.');
    }
    const operation = strictJson(intent, {maxBytes:65_536});
    if (!fields(operation, ['method','target','resources','request']) || operation.method !== 'application.execute' ||
        !fields(operation.target, ['desktopId','sessionId','instanceId','resourceId']) ||
        !fields(operation.request, ['instanceId','sessionId','documentId','resourceId','command','args'])) {
      throw Error('Exact live document operation required.');
    }
    const entry = views.get(operation.target.instanceId);
    requireLive(authority, entry);
    const expected = target(entry);
    if (Object.keys(expected).some(key => operation.target[key] !== expected[key])) throw missing();
    const doc = await document(authority, entry);
    const resources = resourcesFor(entry, doc);
    const request = operation.request;
    if (!sameTarget(doc, request) || !sameSet(operation.resources, resources) ||
        typeof request.command !== 'string' || !Object.hasOwn(entry.commands, request.command) ||
        !entry.commands[request.command](request.args)) throw Error('Operation is outside the live document contract.');

    const consumed = await authority.consume({confirmation, intent});
    const {actor,scope} = consumed;
    if (actor?.kind !== 'agent' || actor.accountId !== authority.accountId || actor.sessionId !== doc.sessionId ||
        scope?.desktopId !== desktopId || scope.instanceId !== doc.instanceId || scope.sessionId !== doc.sessionId ||
        !sameSet(scope.resources, resources) || !scope.commands.includes(request.command)) {
      throw Error('Operation grant did not confirm the exact live document and command.');
    }
    const expires = consumed.expires_at;
    const check = () => {
      requireLive(authority, entry);
      if (!Number.isSafeInteger(expires) || Date.now() >= expires * 1000) throw Error('Operation grant expired.');
    };
    if (!sameBinding(doc, await document(authority, entry))) throw missing();
    check();
    const result = await entry.execute(request, () => {
      check();
      if (entry.bindingId() !== doc.bindingId) throw missing();
    });
    // Completion after a successful dispatch can outlive grant expiry. A replaced
    // account or view must still receive no result from this invocation.
    requireLive(authority, entry);
    const {bindingId, ...documentTarget} = doc;
    return {actor, target:documentTarget, result};
  }

  return {register, bridge:Object.freeze({
    approve, dispatch,
    list: () => owner().list(),
    revoke: id => owner().revoke(id)
  })};
}
