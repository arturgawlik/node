'use strict';
const assert = require('node:assert');
const { test } = require('node:test');

test.skip('mock with "preserveOthers" flag for esm', async (t) => {
  const fixtureEsmPath = `./example-modules/example-module-to-mock.mjs`;
  const mockEsm = t.mock.module(fixtureEsmPath, {
    namedExports: { fn1() { return 'fake-implementation-fn1' } },
    preserveOthers: true
  });
  let esmImpl = await import(fixtureEsmPath);

  assert.strictEqual(esmImpl.fn1(), 'fake-implementation-fn1');
  assert.strictEqual(esmImpl.fn2(), 'original-implementation-fn2');
  assert.strictEqual(esmImpl.default(), 'original-implementation-default');

  mockEsm.restore();
  esmImpl = await import(fixtureEsmPath);

  assert.strictEqual(esmImpl.fn1(), 'original-implementation-fn1');
  assert.strictEqual(esmImpl.fn2(), 'original-implementation-fn2');
  assert.strictEqual(esmImpl.default(), 'original-implementation-default');
});

test('mock with "preserveOthers" flag for cjs', (t) => {
  const mockCjs = t.mock.module(fixtureCjsPath, {
    namedExports: { fn1() { return 'fake-implementation-fn1' } },
    preserveOthers: true
  });
  let cjsImpl = require(fixtureCjsPath);

  assert.strictEqual(cjsImpl.fn1(), 'fake-implementation-fn1');
  assert.strictEqual(cjsImpl.fn2(), 'original-implementation-fn2');
  assert.strictEqual(cjsImpl.default(), 'original-implementation-default');

  mockCjs.restore();
  cjsImpl = require(fixtureCjsPath);

  assert.strictEqual(cjsImpl.fn1(), 'original-implementation-fn1');
  assert.strictEqual(cjsImpl.fn2(), 'original-implementation-fn2');
  assert.strictEqual(cjsImpl.default(), 'original-implementation-default');
});

