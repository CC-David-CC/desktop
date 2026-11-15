import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopController} from '../src/controller.mjs';

async function fixture(policy) {
  const authority = {}, calls = [], decisions = [];
  const desktop = createDesktopController({sessionId: 'session-one', accountId: 'account-one', applications: [{id: 'document', title: 'Document', mount() {}}],
    authorize: (caller, request) => {decisions.push(request); return policy ? policy(caller, request, authority) : caller === authority;}});
  const {desktopId, sessionId} = desktop.inspect();
  const execute = (operation, args) => desktop.execute({desktopId, sessionId, operation, args}, authority);
  const {windowId} = await execute('open', {appId: 'document'});
  const attach = lifecycle => desktop.attachWindow(windowId, lifecycle);
  const detach = attach({inspect: () => {calls.push('inspect'); return {instanceId: windowId, sessionId, dirty: false};},
    execute: async (request, caller) => {calls.push({request, caller}); return {status: 'executed', request};}});
  const target = {desktopId, sessionId, instanceId: windowId, resourceId: 'view:' + windowId};
  const request = {...target, request: {instanceId: windowId, sessionId, resource: null, operation: 'replace', args: {text: 'captured'}}};
  return {desktop, authority, calls, decisions, execute, attach, detach, target, request, windowId};
}

test('live operations require exact desktop/session/view targets and explicit authority', async t => {
  const f = await fixture(); t.after(() => f.desktop.dispose());
  await assert.rejects(f.desktop.inspectApplication(f.target), /caller|denied/i);
  await assert.rejects(f.desktop.inspectApplication(f.target, {}), /denied/i);
  for (const change of [{desktopId: 'other'}, {sessionId: 'other'}, {resourceId: null}, {resourceId: 'view:other'}]) {
    await assert.rejects(f.desktop.inspectApplication({...f.target, ...change}, f.authority), /target/i);
  }
  await assert.rejects(f.desktop.executeApplication({...f.request, request: {...f.request.request, instanceId: 'other'}}, f.authority), /target/i);
  assert.equal(f.calls.length, 0);
  const result = await f.desktop.inspectApplication(f.target, f.authority);
  assert.equal(result.instanceId, f.windowId); assert.equal(result.dirty, false);
});

test('dispatch captures the request before asynchronous authorization and retains the opaque caller', async t => {
  let entered, approve; const waiting = new Promise(resolve => {entered = resolve;});
  const f = await fixture((caller, request, human) => {
    if (request.operation === 'application.execute') {entered(); return new Promise(resolve => {approve = resolve;});}
    return caller === human;
  }); t.after(() => f.desktop.dispose());
  const pending = f.desktop.executeApplication(f.request, f.authority); await waiting;
  f.request.request.operation = 'delete'; f.request.request.args.text = 'changed'; f.request.instanceId = 'other';
  approve(true); const result = await pending;
  assert.equal(result.request.operation, 'replace'); assert.equal(result.request.args.text, 'captured');
  assert.equal(f.calls[0].caller, f.authority); assert.equal(f.decisions.at(-1).appId, 'document'); assert.equal(f.decisions.at(-1).accountId, 'account-one');
});

test('binary operation inputs reach the app intact instead of being JSON-erased', async t => {
  const f = await fixture(); t.after(() => f.desktop.dispose());
  f.request.request.args = {name: 'upload.txt', blob: new Blob(['real bytes'])};
  const result = await f.desktop.executeApplication(f.request, f.authority);
  assert(result.request.args.blob instanceof Blob); assert.equal(await result.request.args.blob.text(), 'real bytes');
});

test('shared-memory and non-JSON containers are refused instead of pretending to capture them', async t => {
  const f = await fixture(); t.after(() => f.desktop.dispose());
  for (const value of [new SharedArrayBuffer(8), new Uint8Array(new SharedArrayBuffer(8)), new Map([['hidden', 'value']]), Number.NaN]) {
    await assert.rejects(f.desktop.executeApplication({...f.request, request: {...f.request.request, args: {value}}}, f.authority), /bounded|cloneable/i);
  }
  assert.equal(f.calls.length, 0);
});

test('detaching and replacing a lifecycle invalidates an earlier permission decision', async t => {
  let entered, approve; const waiting = new Promise(resolve => {entered = resolve;});
  const f = await fixture((caller, request, human) => {
    if (request.operation === 'application.inspect') {entered(); return new Promise(resolve => {approve = resolve;});}
    return caller === human;
  }); t.after(() => f.desktop.dispose());
  const pending = f.desktop.inspectApplication(f.target, f.authority); await waiting;
  f.detach(); let inspected = false; f.attach({inspect() {inspected = true; return {};}}); approve(true);
  await assert.rejects(pending, /changed|unavailable/i); assert.equal(inspected, false); assert.equal(f.calls.length, 0);
});

test('closing a window while authorization waits prevents application execution', async t => {
  let entered, approve; const waiting = new Promise(resolve => {entered = resolve;});
  const f = await fixture((caller, request, human) => {
    if (request.operation === 'application.execute') {entered(); return new Promise(resolve => {approve = resolve;});}
    return caller === human;
  }); t.after(() => f.desktop.dispose());
  const pending = f.desktop.executeApplication(f.request, f.authority); await waiting;
  await f.execute('close', {windowId: f.windowId}); approve(true);
  await assert.rejects(pending, /changed|exists|unavailable/i); assert.equal(f.calls.length, 0);
});

test('an operation completing after view removal reports an uncertain result, never a rollback', async t => {
  const f = await fixture(); t.after(() => f.desktop.dispose()); f.detach();
  let entered, complete; const waiting = new Promise(resolve => {entered = resolve;});
  f.attach({execute() {entered(); return new Promise(resolve => {complete = resolve;});}});
  const pending = f.desktop.executeApplication(f.request, f.authority); await waiting;
  await f.execute('close', {windowId: f.windowId}); complete({committed: true});
  await assert.rejects(pending, error => error.outcome === 'unknown' && /verify/i.test(error.message));
});

test('unsupported views and disposed sessions do not get fallback command implementations', async () => {
  const f = await fixture(); f.detach(); f.attach({dispose() {}});
  await assert.rejects(f.desktop.executeApplication(f.request, f.authority), /unavailable/i);
  f.desktop.dispose(); await assert.rejects(f.desktop.inspectApplication(f.target, f.authority), /ended/i);
});

test('mutating a caller-owned lifecycle object cannot replace its registered callbacks', async t => {
  const f = await fixture(); t.after(() => f.desktop.dispose()); f.detach();
  const lifecycle = {execute: () => ({implementation: 'registered'})}; f.attach(lifecycle);
  lifecycle.execute = () => ({implementation: 'replaced outside Desktop'});
  const result = await f.desktop.executeApplication(f.request, f.authority);
  assert.equal(result.implementation, 'registered');
});
