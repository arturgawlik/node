// Flags: --experimental-test-module-mocks --experimental-require-module 
'use strict';
const common = require('../common');
const { isMainThread } = require('worker_threads');

if (!isMainThread) {
  common.skip('registering customization hooks in Workers does not work');
}

const fixtures = require('../common/fixtures');
const assert = require('node:assert');
const { relative } = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

// for time of development those tests are is separated file, but after that
// they can be moved to `test-runner-module-mocking.js` (probably just to the bottom)
test('mocking with preserveOthers option', async (t) => {
  await t.test('ESM loader mocking ESM module', async (t) => {
    const basicEsmFixture = fixtures.fileURL('module-mocking', 'basic-esm.mjs');
    const basicEsmDefaultFixture = fixtures.fileURL('module-mocking', 'basic-esm-default.mjs');
    const originalEsmString = 'original esm string';
    const originalEsmStringDefault = 'original esm string default';

    await t.test('coexisting original and mocked exports', async (t) => {
      await t.test('preserves original module exports', async (t) => {
        t.mock.module(basicEsmFixture, {
          preserveOthers: true
        });
        const mocked = await import(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
      });

      await t.test('preserves original module default exports', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          preserveOthers: true
        });
        const mocked = await import(basicEsmDefaultFixture);

        assert.strictEqual(mocked.default, originalEsmStringDefault);
      });

      await t.test('preserves original module exports with additional named exports', async (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = await import(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
        assert.strictEqual(mocked.fn(), 42);
      });

      await t.test('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = await import(basicEsmDefaultFixture);
        assert.strictEqual(mocked.default, originalEsmStringDefault);
        assert.strictEqual(mocked.fn(), 42);
      });
    });

    await t.test('overriding original exports', async (t) => {
      await t.test('override original module export', async (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            string: 'mocked esm string'
          },
          preserveOthers: true
        });
        const mocked = await import(basicEsmFixture);

        assert.strictEqual(mocked.string, 'mocked esm string');
      });

      await t.test('override original default module export', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          defaultExport: 'mocked esm string default',
          preserveOthers: true
        });
        const mocked = await import(basicEsmDefaultFixture);

        assert.strictEqual(mocked.default, 'mocked esm string default');
      });
    });
  });

  await t.test('ESM loader mocking CJS module', async (t) => {
    const basicCjsFixture = fixtures.fileURL('module-mocking', 'basic-cjs.js');
    const basicCjsDefaultFixture = fixtures.fileURL('module-mocking', 'basic-cjs-default.js');
    const originalCjsString = 'original cjs string';
    const originalCjsStringDefault = 'original cjs string default';

    await t.test('coexisting original and mocked exports', async (t) => {
      await t.test('preserves original module exports', async (t) => {
        t.mock.module(basicCjsFixture, {
          preserveOthers: true
        });
        const mocked = await import(basicCjsFixture);

        assert.strictEqual(mocked.default.string, originalCjsString);
      });

      await t.test('preserves original module default exports', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          preserveOthers: true
        });
        const mocked = await import(basicCjsDefaultFixture);

        assert.strictEqual(mocked.default.msg, originalCjsStringDefault);
      });

      await t.test('preserves original module exports with additional named exports', async (t) => {
        t.mock.module(basicCjsFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = await import(basicCjsFixture);

        assert.strictEqual(mocked.default.string, originalCjsString);
        assert.strictEqual(mocked.default.fn(), 42);
      });

      await t.test('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = await import(basicCjsDefaultFixture);
        assert.strictEqual(mocked.default.msg, originalCjsStringDefault);
        assert.strictEqual(mocked.default.fn(), 42);
      });
    });

    await t.test('overriding original exports', async (t) => {
      await t.test('override original module export', async (t) => {
        t.mock.module(basicCjsFixture, {
          namedExports: {
            string: 'mocked cjs string'
          },
          preserveOthers: true
        });
        const mocked = await import(basicCjsFixture);

        assert.strictEqual(mocked.default.string, 'mocked cjs string');
      });

      await t.test('override original default module export', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          defaultExport: 'mocked cjs string default',
          preserveOthers: true
        });
        const mocked = await import(basicCjsDefaultFixture);

        assert.strictEqual(mocked.default, 'mocked cjs string default');
      });
    });
  });

  await t.test('CJS loader mocking CJS module', async (t) => {
    const basicCjsFixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const basicCjsDefaultFixture = fixtures.path('module-mocking', 'basic-cjs-default.js');
    const originalCjsString = 'original cjs string';
    const originalCjsStringDefault = 'original cjs string default';

    t.test('coexisting original and mocked exports', (t) => {
      t.test('preserves original module exports', (t) => {
        t.mock.module(basicCjsFixture, {
          preserveOthers: true
        });
        const mocked = require(basicCjsFixture);

        assert.strictEqual(mocked.string, originalCjsString);
      });

      t.test('preserves original module default exports', (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          preserveOthers: true
        });
        const mocked = require(basicCjsDefaultFixture);

        assert.deepStrictEqual(mocked, {
          msg: originalCjsStringDefault
        });
      });

      t.test('preserves original module exports with additional named exports', (t) => {
        t.mock.module(basicCjsFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = require(basicCjsFixture);

        assert.strictEqual(mocked.string, originalCjsString);
        assert.strictEqual(mocked.fn(), 42);
      });

      t.test('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = require(basicCjsDefaultFixture);
        assert.partialDeepStrictEqual(mocked, {
          msg: originalCjsStringDefault
        });
        assert.strictEqual(mocked.fn(), 42);
      });
    });

    t.test('overriding original exports', (t) => {
      t.test('override original module export', (t) => {
        const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
        t.mock.module(basicCjsFixture, {
          namedExports: {
            string: 'mocked cjs string'
          },
          preserveOthers: true
        });
        const mocked = require(basicCjsFixture);

        assert.strictEqual(mocked.string, 'mocked cjs string');
      });

      t.test('override original default module export', (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          defaultExport: {
            msg: 'mocked cjs string default'
          },
          preserveOthers: true
        });
        const mocked = require(basicCjsDefaultFixture);

        assert.deepStrictEqual(mocked, {
          msg: 'mocked cjs string default'
        });
      });
    });
  });

  await t.test('CJS loader mocking ESM module', async (t) => {
    const basicEsmFixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const basicEsmDefaultFixture = fixtures.path('module-mocking', 'basic-esm-default.mjs');
    const originalEsmString = 'original esm string';
    const originalEsmStringDefault = 'original esm string default';

    t.test('coexisting original and mocked exports', (t) => {
      t.test('preserves original module exports', (t) => {
        t.mock.module(basicEsmFixture, {
          preserveOthers: true
        });
        const mocked = require(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
      });

      t.test('preserves original module default exports', (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          preserveOthers: true
        });
        const mocked = require(basicEsmDefaultFixture);

        assert.deepStrictEqual(mocked, {
          __esModule: true,
          default: originalEsmStringDefault
        });
      });

      t.test('preserves original module exports with additional named exports', (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = require(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
        assert.strictEqual(mocked.fn(), 42);
      });

      t.test('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          namedExports: {
            fn: () => 42
          },
          preserveOthers: true
        });
        const mocked = require(basicEsmDefaultFixture);
        assert.partialDeepStrictEqual(mocked, {
          default: originalEsmStringDefault
        });
        assert.strictEqual(mocked.fn(), 42);
      });
    });

    t.test('overriding original exports', (t) => {
      t.test('override original module export', (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            string: 'mocked esm string'
          },
          preserveOthers: true
        });
        const mocked = require(basicEsmFixture);

        assert.strictEqual(mocked.string, 'mocked esm string');
      });

      t.test('override original default module export', (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          defaultExport: {
            msg: 'mocked esm string default'
          },
          preserveOthers: true
        });
        const mocked = require(basicEsmDefaultFixture);

        assert.deepStrictEqual(mocked, {
          msg: 'mocked esm string default'
        });
      });
    });
  });
});
