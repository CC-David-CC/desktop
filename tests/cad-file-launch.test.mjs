import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../active-system/app.js', import.meta.url), 'utf8');
const start = source.indexOf('class Desktop {');
const end = source.indexOf('\n}\n', start) + 2;

function fixture(kind) {
  const owner = kind === 'anonymous' ? 'tab-a' : 'account-a';
  const globals = {currentSession: {public: {kind}}, workspaceOwner: () => owner,
    signedInSubject: () => kind === 'anonymous' ? null : owner};
  const desktop = Object.create(vm.runInNewContext('(' + source.slice(start, end) + ')', globals).prototype);
  desktop.windows = [];
  desktop.render = () => {};
  desktop.activateWindow = () => {};
  desktop.launch = (app, title) => {
    const w = {app, title}; desktop.windows.push(w); return w;
  };
  return {desktop, owner};
}

for (const kind of ['anonymous', 'registered']) {
  for (const [app, path] of [['jsketcher', '/Documents/part.cad'], ['calculator', '/Documents/graph.calc.json']]) {
    test(app + ' opens a selected revision for a ' + kind + ' workspace', () => {
      const {desktop, owner} = fixture(kind);
      const storage = kind === 'anonymous' ? 'temporary' : 'mirror';
      const resource = {owner, storage, version: 1, sha256: 'a'.repeat(64), path};
      for (const change of [
        {owner: 'other'}, {sha256: 'invalid'}, {path: '/../outside.cad'},
        {storage: storage === 'mirror' ? 'temporary' : 'mirror'}
      ]) {
        assert.throws(() => desktop.open(app, {...resource, ...change}));
      }
      if (app === 'calculator') {
        const {sha256, ...withoutRevision} = resource;
        assert.throws(() => desktop.open(app, withoutRevision));
      }
      assert.equal(desktop.windows.length, 0);
      const w = desktop.open(app, resource);
      assert.equal(w.launchContext.sha256, resource.sha256);
      assert.equal(w.launchContext.owner, owner);
      assert.equal(w.launchContext.storage, storage);
      assert.equal(desktop.open(app, resource), w);
      assert.equal(desktop.windows.length, 1);
    });
  }
}
