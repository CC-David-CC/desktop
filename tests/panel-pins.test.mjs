import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {createPanelPins, settingsPath} from '../active-system/assets/desktop/panel-pins.mjs';

const missing = () => Object.assign(Error('File not found'), {status: 404});
const dataFor = workspaces => JSON.stringify({schema: 'webos-panel-pins/1', workspaces});

function fixture() {
  let entry, writes = 0;
  const replace = text => {
    const data = new TextEncoder().encode(text);
    entry = {data, sha256: createHash('sha256').update(data).digest('hex')};
    return entry;
  };
  const files = {
    async version(path) {
      assert.equal(path, settingsPath);
      if (!entry) throw missing();
      return {bytes: entry.data.length, sha256: entry.sha256};
    },
    async read(path) {
      assert.equal(path, settingsPath);
      if (!entry) throw missing();
      return entry;
    },
    async write(path, text, previous) {
      assert.equal(path, settingsPath);
      if ((entry?.sha256 ?? null) !== previous) throw Error('Revision changed');
      writes++;
      return replace(text);
    },
    async remove(path, previous) {
      assert.equal(path, settingsPath);
      assert.equal(entry.sha256, previous);
      entry = undefined;
    },
  };
  return {context: async () => ({valid: () => true, files}), files, replace, writes: () => writes};
}

test('defaults require no file and removing the last override restores defaults', async () => {
  const account = fixture();
  const state = createPanelPins(() => {});
  state.reset(account.context);
  await state.refresh();
  assert.deepEqual(state.pins(0), ['files']);
  assert.equal(account.writes(), 0);
  await state.setPinned(0, 'weather', true);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((await account.files.read(settingsPath)).data)).workspaces, {'0': ['files', 'weather']});
  assert.deepEqual(state.pins(1), ['files']);
  await state.setPinned(0, 'weather', false);
  await assert.rejects(account.files.version(settingsPath), {status: 404});
});

test('refresh applies a remote file revision and preserves an explicit empty list', async () => {
  const account = fixture();
  let renders = 0;
  const state = createPanelPins(() => renders++);
  state.reset(account.context);
  account.replace(dataFor({'0': ['weather-maps'], '1': []}));
  await state.refresh();
  await state.refresh();
  assert.deepEqual(state.pins(0), ['weather-maps']);
  assert.deepEqual(state.pins(1), []);
  assert.equal(renders, 1);
  assert.equal(account.writes(), 0);
  account.replace(dataFor({'0': ['cadcraft']}));
  await state.refresh();
  assert.deepEqual(state.pins(0), ['cadcraft']);
  assert.deepEqual(state.pins(1), ['files']);
});

test('a concurrent replacement wins a stale write and an unrelated file is preserved', async () => {
  const account = fixture();
  const state = createPanelPins(() => {});
  state.reset(account.context);
  await state.setPinned(0, 'weather', true);
  account.replace(dataFor({'0': ['files', 'cadcraft']}));
  await assert.rejects(state.setPinned(0, 'terminal', true), /revision changed/i);
  await state.refresh();
  assert.deepEqual(state.pins(0), ['files', 'cadcraft']);
  account.replace('{"reminder":"keep this"}');
  await assert.rejects(state.refresh(), /does not contain app bar settings/);
  assert.equal(new TextDecoder().decode((await account.files.read(settingsPath)).data), '{"reminder":"keep this"}');
  assert.deepEqual(state.pins(0), ['files', 'cadcraft']);
});

test('switching accounts drops settings from a pending refresh and Anon stays local', async () => {
  const account = fixture();
  account.replace(dataFor({'0': ['terminal']}));
  const state = createPanelPins(() => {});
  let finish;
  const canRead = new Promise(resolve => { finish = resolve; });
  let started;
  const reading = new Promise(resolve => { started = resolve; });
  state.reset(async () => ({valid: () => true, files: {...account.files, async read(path) {
    started();
    await canRead;
    return account.files.read(path);
  }}}));
  const stale = state.refresh();
  await reading;
  state.reset(null);
  finish();
  await stale;
  assert.deepEqual(state.pins(0), ['files']);
  await state.setPinned(0, 'weather', true);
  assert.deepEqual(state.pins(0), ['files', 'weather']);
  assert.equal(account.writes(), 0);
});
