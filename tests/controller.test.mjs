import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopController} from '../src/controller.mjs';
function fixture(authorize) {
  const authority = Object.freeze({}), desktop = createDesktopController({sessionId: 'session-one', accountId: 'user:one',
    applications: [{id: 'document', title: 'Document', mount() {}}], authorize: authorize || (candidate => candidate === authority)});
  const snapshot = desktop.inspect();
  const execute = (operation, args = {}, candidate = authority) => desktop.execute({desktopId: snapshot.desktopId, sessionId: snapshot.sessionId, operation, args}, candidate);
  return {desktop, execute, authority};
}
test('explicit targets and authority gate the same domain operations used by views', async () => {
  const {desktop, execute} = fixture();
  await assert.rejects(execute('open', {appId: 'document'}, {}), /denied/);
  await assert.rejects(desktop.execute({desktopId: desktop.inspect().desktopId, sessionId: 'old-session', operation: 'open'}, {}), /target/);
  assert.equal(desktop.inspect().windows.length, 0);
  const {windowId} = await execute('open', {appId: 'document', resource: {path: 'Documents/one.docx'}});
  const snapshot = desktop.inspect(); snapshot.windows[0].resource.path = 'tampered';
  assert.equal(desktop.inspect().windows[0].resource.path, 'Documents/one.docx');
  await execute('workspace', {index: 1}); assert.equal(desktop.inspect().focused, null);
  await execute('focus', {windowId}); assert.equal(desktop.inspect().workspace, 0);
  desktop.dispose(); await assert.rejects(execute('open', {appId: 'document'}), /ended/);
});
test('cancelled or failed unsaved-close keeps the window and its live view', async () => {
  const {desktop, execute} = fixture(); const {windowId} = await execute('open', {appId: 'document'});
  let allow = false, disposed = 0;
  desktop.attachWindow(windowId, {requestClose: async () => { if (allow === 'error') throw Error('Save failed'); return allow; }, dispose: () => disposed++});
  assert.equal((await execute('close', {windowId})).status, 'cancelled'); assert.equal(disposed, 0);
  allow = 'error'; await assert.rejects(execute('close', {windowId}), /Save failed/);
  assert.equal(desktop.inspect().windows.length, 1); assert.equal(desktop.inspect().windows[0].closing, false);
  allow = true; assert.equal((await execute('close', {windowId})).status, 'closed'); assert.equal(disposed, 1);
});
test('session disposal fences an operation awaiting authorization', async () => {
  let authorize; const pending = new Promise(resolve => {authorize = resolve}); const {desktop, execute} = fixture(() => pending);
  const operation = execute('open', {appId: 'document'}); desktop.dispose(); authorize(true);
  await assert.rejects(operation, /ended/); assert.equal(desktop.inspect().windows.length, 0);
});
test('two windows keep separate identities and closing one retains the other', async () => {
  const {desktop, execute} = fixture(); const a = await execute('open', {appId: 'document'}), b = await execute('open', {appId: 'document'});
  assert.notEqual(a.windowId, b.windowId);
  await execute('close', {windowId: a.windowId}); assert.equal(desktop.inspect().windows[0].id, b.windowId);
  const release = desktop.attachView(); assert.throws(() => desktop.attachView(), /already/); release();
  assert.equal(desktop.inspect().windows.length, 1); desktop.dispose();
});
