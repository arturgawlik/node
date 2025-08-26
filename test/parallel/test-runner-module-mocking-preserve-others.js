// Flags: --experimental-test-module-mocks --experimental-require-module
'use strict';
const common = require('../common');
const { isMainThread } = require('worker_threads');

if (!isMainThread) {
  common.skip('registering customization hooks in Workers does not work');
}

const fixtures = require('../common/fixtures');
const assert = require('node:assert');
const { test } = require('node:test');

// For time of development those tests are is separated file, but after that
// they can be moved to `test-runner-module-mocking.js` (probably just to the bottom)
test('mocking with preserveOthers option', async (t) => {
  await test.skip('ESM loader mocking ESM module', async (t) => {
    const basicEsmFixture = fixtures.fileURL('module-mocking', 'basic-esm.mjs');
    const basicEsmDefaultFixture = fixtures.fileURL(
      'module-mocking',
      'basic-esm-default.mjs'
    );
    const originalEsmString = 'original esm string';
    const originalEsmStringDefault = 'original esm string default';

    await test.skip('coexisting original and mocked exports', async (t) => {
      await test.skip('preserves original module exports', async (t) => {
        t.mock.module(basicEsmFixture, {
          preserveOthers: true,
        });
        const mocked = await import(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
      });

      await test.skip('preserves original module default exports', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          preserveOthers: true,
        });
        const mocked = await import(basicEsmDefaultFixture);

        assert.strictEqual(mocked.default, originalEsmStringDefault);
      });

      await test.skip('preserves original module exports with additional named exports', async (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = await import(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
        assert.strictEqual(mocked.fn(), 42);
      });

      await test.skip('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = await import(basicEsmDefaultFixture);
        assert.strictEqual(mocked.default, originalEsmStringDefault);
        assert.strictEqual(mocked.fn(), 42);
      });
    });

    await test.skip('overriding original exports', async (t) => {
      await test.skip('override original module export', async (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            string: 'mocked esm string',
          },
          preserveOthers: true,
        });
        const mocked = await import(basicEsmFixture);

        assert.strictEqual(mocked.string, 'mocked esm string');
      });

      await test.skip('override original default module export', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          defaultExport: 'mocked esm string default',
          preserveOthers: true,
        });
        const mocked = await import(basicEsmDefaultFixture);

        assert.strictEqual(mocked.default, 'mocked esm string default');
      });
    });
  });

  await test.skip('ESM loader mocking CJS module', async (t) => {
    const basicCjsFixture = fixtures.fileURL('module-mocking', 'basic-cjs.js');
    const basicCjsDefaultFixture = fixtures.fileURL(
      'module-mocking',
      'basic-cjs-default.js'
    );
    const originalCjsString = 'original cjs string';
    const originalCjsStringDefault = 'original cjs string default';

    await test.skip('coexisting original and mocked exports', async (t) => {
      await test.skip('preserves original module exports', async (t) => {
        t.mock.module(basicCjsFixture, {
          preserveOthers: true,
        });
        const mocked = await import(basicCjsFixture);

        assert.strictEqual(mocked.default.string, originalCjsString);
      });

      await test.skip('preserves original module default exports', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          preserveOthers: true,
        });
        const mocked = await import(basicCjsDefaultFixture);

        assert.strictEqual(mocked.default.msg, originalCjsStringDefault);
      });

      await test.skip('preserves original module exports with additional named exports', async (t) => {
        t.mock.module(basicCjsFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = await import(basicCjsFixture);

        assert.strictEqual(mocked.default.string, originalCjsString);
        assert.strictEqual(mocked.default.fn(), 42);
      });

      await test.skip('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = await import(basicCjsDefaultFixture);
        assert.strictEqual(mocked.default.msg, originalCjsStringDefault);
        assert.strictEqual(mocked.default.fn(), 42);
      });
    });

    await test.skip('overriding original exports', async (t) => {
      await test.skip('override original module export', async (t) => {
        t.mock.module(basicCjsFixture, {
          namedExports: {
            string: 'mocked cjs string',
          },
          preserveOthers: true,
        });
        const mocked = await import(basicCjsFixture);

        assert.strictEqual(mocked.default.string, 'mocked cjs string');
      });

      await test.skip('override original default module export', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          defaultExport: 'mocked cjs string default',
          preserveOthers: true,
        });
        const mocked = await import(basicCjsDefaultFixture);

        assert.strictEqual(mocked.default, 'mocked cjs string default');
      });
    });
  });

  await test.skip('ESM loader mocking builtin module', async (t) => {
    const builtinModule = 'node:fs';
    await test('coexisting original and mocked exports', async (t) => {
      await test.skip('preserves original module exports', async (t) => {
        t.mock.module(builtinModule, {
          preserveOthers: true,
        });
        const mocked = await import(builtinModule);

        assert.strictEqual(mocked.default.read.name, 'read');
      });

      await test('preserves original module exports with additional named exports', async (t) => {
        t.mock.module(builtinModule, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = await import(builtinModule);

        assert.strictEqual(mocked.default.read.name, 'read');
        assert.strictEqual(mocked.default.fn(), 42);
      });
    });

    await test('overriding original exports', async (t) => {
      await test('override original module export', async (t) => {
        t.mock.module(builtinModule, {
          namedExports: {
            read: 'mocked cjs string',
          },
          preserveOthers: true,
        });
        const mocked = await import(builtinModule);

        assert.strictEqual(mocked.default.read, 'mocked cjs string');
      });

      await test('override original default module export', async (t) => {
        t.mock.module(builtinModule, {
          defaultExport: 'mocked cjs string default',
          preserveOthers: true,
        });
        const mocked = await import(builtinModule);

        assert.strictEqual(mocked.default, 'mocked cjs string default');
      });
    });
  });

  await test.skip('ESM loader mocking module with invalid URL', async (t) => {
    // TODO this test
    // this maybe involves some URL that is e.g. custom resolved by some hook??
    const invalidUrl = 'some-invalid-url';
    t.mock.module(invalidUrl, {
      preserveOthers: true,
    });
    const mocked = await import(invalidUrl);
    assert.strictEqual(mocked.read.name, 'read');
  });

  await test.skip('CJS loader mocking CJS module', async (t) => {
    const basicCjsFixture = fixtures.path('module-mocking', 'basic-cjs.js');
    const basicCjsDefaultFixture = fixtures.path(
      'module-mocking',
      'basic-cjs-default.js'
    );
    const originalCjsString = 'original cjs string';
    const originalCjsStringDefault = 'original cjs string default';

    test.skip('coexisting original and mocked exports', (t) => {
      test.skip('preserves original module exports', (t) => {
        t.mock.module(basicCjsFixture, {
          preserveOthers: true,
        });
        const mocked = require(basicCjsFixture);

        assert.strictEqual(mocked.string, originalCjsString);
      });

      test.skip('preserves original module default exports', (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          preserveOthers: true,
        });
        const mocked = require(basicCjsDefaultFixture);

        assert.deepStrictEqual(mocked, {
          msg: originalCjsStringDefault,
        });
      });

      test.skip('preserves original module exports with additional named exports', (t) => {
        t.mock.module(basicCjsFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = require(basicCjsFixture);

        assert.strictEqual(mocked.string, originalCjsString);
        assert.strictEqual(mocked.fn(), 42);
      });

      test.skip('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = require(basicCjsDefaultFixture);
        assert.partialDeepStrictEqual(mocked, {
          msg: originalCjsStringDefault,
        });
        assert.strictEqual(mocked.fn(), 42);
      });
    });

    test.skip('overriding original exports', (t) => {
      test.skip('override original module export', (t) => {
        const fixture = fixtures.path('module-mocking', 'basic-cjs.js');
        t.mock.module(basicCjsFixture, {
          namedExports: {
            string: 'mocked cjs string',
          },
          preserveOthers: true,
        });
        const mocked = require(basicCjsFixture);

        assert.strictEqual(mocked.string, 'mocked cjs string');
      });

      test.skip('override original default module export', (t) => {
        t.mock.module(basicCjsDefaultFixture, {
          defaultExport: {
            msg: 'mocked cjs string default',
          },
          preserveOthers: true,
        });
        const mocked = require(basicCjsDefaultFixture);

        assert.deepStrictEqual(mocked, {
          msg: 'mocked cjs string default',
        });
      });
    });
  });

  await test.skip('CJS loader mocking ESM module', async (t) => {
    const basicEsmFixture = fixtures.path('module-mocking', 'basic-esm.mjs');
    const basicEsmDefaultFixture = fixtures.path(
      'module-mocking',
      'basic-esm-default.mjs'
    );
    const originalEsmString = 'original esm string';
    const originalEsmStringDefault = 'original esm string default';

    test.skip('coexisting original and mocked exports', (t) => {
      test('preserves original module exports', (t) => {
        t.mock.module(basicEsmFixture, {
          preserveOthers: true,
        });
        const mocked = require(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
      });

      test.skip('preserves original module default exports', (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          preserveOthers: true,
        });
        const mocked = require(basicEsmDefaultFixture);

        assert.deepStrictEqual(mocked, {
          __esModule: true,
          default: originalEsmStringDefault,
        });
      });

      test.skip('preserves original module exports with additional named exports', (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = require(basicEsmFixture);

        assert.strictEqual(mocked.string, originalEsmString);
        assert.strictEqual(mocked.fn(), 42);
      });

      test.skip('preserves original module default export with additional named exports', async (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = require(basicEsmDefaultFixture);
        assert.partialDeepStrictEqual(mocked, {
          default: originalEsmStringDefault,
        });
        assert.strictEqual(mocked.fn(), 42);
      });
    });

    test.skip('overriding original exports', (t) => {
      test.skip('override original module export', (t) => {
        t.mock.module(basicEsmFixture, {
          namedExports: {
            string: 'mocked esm string',
          },
          preserveOthers: true,
        });
        const mocked = require(basicEsmFixture);

        assert.strictEqual(mocked.string, 'mocked esm string');
      });

      test.skip('override original default module export', (t) => {
        t.mock.module(basicEsmDefaultFixture, {
          defaultExport: {
            msg: 'mocked esm string default',
          },
          preserveOthers: true,
        });
        const mocked = require(basicEsmDefaultFixture);

        assert.deepStrictEqual(mocked, {
          msg: 'mocked esm string default',
        });
      });
    });
  });

  await test('CJS loader mocking builtin module', (t) => {
    const builtinModule = 'node:fs';
    test('coexisting original and mocked exports', (t) => {
      test('preserves original module exports', (t) => {
        t.mock.module(builtinModule, {
          preserveOthers: true,
        });
        const mocked = require(builtinModule);

        assert.strictEqual(mocked.read.name, 'read');
      });

      test('preserves original module exports with additional named exports', (t) => {
        t.mock.module(builtinModule, {
          namedExports: {
            fn: () => 42,
          },
          preserveOthers: true,
        });
        const mocked = require(builtinModule);

        assert.strictEqual(mocked.read.name, 'read');
        assert.strictEqual(mocked.fn(), 42);
      });
    });

    test('overriding original exports', (t) => {
      test('override original module export', (t) => {
        t.mock.module(builtinModule, {
          namedExports: {
            read: 'mocked cjs string',
          },
          preserveOthers: true,
        });
        const mocked = require(builtinModule);

        assert.strictEqual(mocked.read, 'mocked cjs string');
      });

      test('override original default module export', (t) => {
        t.mock.module(builtinModule, {
          defaultExport: {
            msg: 'mocked cjs string default',
          },
          preserveOthers: true,
        });
        const mocked = require(builtinModule);

        assert.deepStrictEqual(mocked, {
          msg: 'mocked cjs string default',
        });
      });
    });
  });

  await test.skip('CJS loader mocking module with invalid URL', (t) => {
    // TODO this test
    // this maybe involves some URL that is e.g. custom resolved by some hook??
    const invalidUrl = 'some-invalid-url';
    t.mock.module(invalidUrl, {
      preserveOthers: true,
    });
    const mocked = require(invalidUrl);
    assert.strictEqual(mocked.read.name, 'read');
  });
});
