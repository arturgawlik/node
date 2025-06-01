'use strict';
const {
  JSONStringify,
  SafeMap,
  globalThis: {
    Atomics: {
      notify: AtomicsNotify,
      store: AtomicsStore,
    },
  },
  ArrayPrototypeIncludes,
  ArrayPrototypeJoin
} = primordials;
const {
  kBadExportsMessage,
  kMockSearchParam,
  kMockSuccess,
  kMockExists,
  kMockUnknownMessage,
} = require('internal/test_runner/mock/mock');
const { URL, URLParse } = require('internal/url');
let debug = require('internal/util/debuglog').debuglog('test_runner', (fn) => {
  debug = fn;
});

// TODO(cjihrig): The mocks need to be thread aware because the exports are
// evaluated on the thread that creates the mock. Before marking this API as
// stable, one of the following issues needs to be implemented:
// https://github.com/nodejs/node/issues/49472
// or https://github.com/nodejs/node/issues/52219

const mocks = new SafeMap();

async function initialize(data) {
  data?.port.on('message', ({ type, payload }) => {
    debug('mock loader received message type "%s" with payload %o', type, payload);

    if (type === 'node:test:register') {
      const { baseURL } = payload;
      const mock = mocks.get(baseURL);

      if (mock?.active) {
        debug('already mocking "%s"', baseURL);
        sendAck(payload.ack, kMockExists);
        return;
      }

      const localVersion = mock?.localVersion ?? 0;

      debug('new mock version %d for "%s"', localVersion, baseURL);
      mocks.set(baseURL, {
        __proto__: null,
        active: true,
        cache: payload.cache,
        exportNames: payload.exportNames,
        preserveOthers: payload.preserveOthers,
        format: payload.format,
        hasDefaultExport: payload.hasDefaultExport,
        localVersion,
        url: baseURL,
      });
      sendAck(payload.ack);
    } else if (type === 'node:test:unregister') {
      const mock = mocks.get(payload.baseURL);

      if (mock !== undefined) {
        mock.active = false;
        mock.localVersion++;
      }

      sendAck(payload.ack);
    } else {
      sendAck(payload.ack, kMockUnknownMessage);
    }
  });
}

async function resolve(specifier, context, nextResolve) {
  debug('resolve hook entry, specifier = "%s", context = %o', specifier, context);

  const nextResolveResult = await nextResolve(specifier, context);
  const mockSpecifier = nextResolveResult.url;

  const mock = mocks.get(mockSpecifier);
  debug('resolve hook, specifier = "%s", mock = %o', specifier, mock);

  if (mock?.active !== true) {
    return nextResolveResult;
  }

  const url = new URL(mockSpecifier);
  url.searchParams.set(kMockSearchParam, mock.localVersion);

  if (!mock.cache) {
    // With ESM, we can't remove modules from the cache. Bump the module's
    // version instead so that the next import will be uncached.
    mock.localVersion++;
  }

  const { href } = url;
  debug('resolve hook finished, url = "%s"', href);
  return { __proto__: null, url: href, format: nextResolveResult.format };
}

async function load(url, context, nextLoad) {
  debug('load hook entry, url = "%s", context = %o', url, context);
  const parsedURL = URLParse(url);
  if (parsedURL) {
    parsedURL.searchParams.delete(kMockSearchParam);
  }

  const baseURL = parsedURL ? parsedURL.href : url;
  const mock = mocks.get(baseURL);

  const original = await nextLoad(url, context);
  debug('load hook, mock = %o', mock);
  if (mock?.active !== true) {
    return original;
  }

  // Treat builtins as commonjs because customization hooks do not allow a
  // core module to be replaced.
  // Also collapse 'commonjs-sync' and 'require-commonjs' to 'commonjs'.
  let format = original.format;
  switch (original.format) {
    case 'builtin': // Deliberate fallthrough
    case 'commonjs-sync': // Deliberate fallthrough
    case 'require-commonjs':
      format = 'commonjs';
      break;
    case 'json':
      format = 'module';
      break;
  }

  let originalModuleReexports;
  if (mock.preserveOthers) {
    originalModuleReexports = createOriginalModuleSources(original.source, format, mock);
  }

  const result = {
    __proto__: null,
    format,
    shortCircuit: true,
    source: await createSourceFromMock(mock, format, originalModuleReexports, mock.baseURL),
  };

  debug('load hook finished, result = %o', result);
  return result;
}

function createOriginalModuleSources(originalSource, originalFormat, mock) {
  const { exportNames: mockedExports, hasDefaultExport: mockHasDefault } = mock;

  const { stringify } = require('internal/modules/helpers');
  const stringifiedSource = stringify(originalSource);

  let originalExports = null;
  if (originalFormat === 'module') {
    originalExports = createEsmExports(stringifiedSource, mockHasDefault);
  } else if (originalFormat === 'commonjs') {
    originalExports = createCjsExports(stringifiedSource, mockHasDefault)
  } else {
    throw new Error(`Unknown moduleType: "${originalFormat}".`)
  }

  const originalModuleReexports = originalExports.filter(originalExport => !mockedExports.includes(originalExport));
  return originalModuleReexports;
}

function createEsmExports(stringifiedSource, mockHasDefault) {
  // TODO: instead of using `es-module-lexer` probably there is already 
  // implemented something similar in node.js itself
  // so it can be used instead of this external dependency
  const esmParse = require('internal/deps/es-module-lexer/lexer').parse;
  const [, exportObjs] = esmParse(stringifiedSource)
  let exports = exportObjs.map(exportObj => exportObj.n);
  if (mockHasDefault) {
    exports = exports.filter(exportName => exportName !== 'default');
  }
  return exports;
}

function createCjsExports(stringifiedSource, mockHasDefault) {
  // TODO: ensure whether: 
  // 1. it is working
  // 2. we can use this library here
  // 3. if yes, maybe this (require) should be cached
  const cjsParse = require('internal/deps/cjs-module-lexer/lexer').parse;
  const { exports, reexports } = cjsParse(stringifiedSource)
  // TODO: ensure that `reexports` is not duplicating entries from `exports`
  return [
    ...exports,
    ...reexports
  ]
}

async function createSourceFromMock(mock, format, originalModuleReexports, originalModuleUrl) {
  // Create mock implementation from provided exports.
  const { exportNames, hasDefaultExport, url, preserveOthers } = mock;
  const useESM = format === 'module' || format === 'module-typescript';
  const source = `${testImportSource(useESM)}
if (!$__test.mock._mockExports.has(${JSONStringify(url)})) {
  throw new Error(${JSONStringify(`mock exports not found for "${url}"`)});
}

const $__exports = $__test.mock._mockExports.get(${JSONStringify(url)});
${preservedExportsSource(useESM, originalModuleReexports, originalModuleUrl)}
${defaultExportSource(useESM, hasDefaultExport)}
${namedExportsSource(useESM, exportNames)}
`;

  return source;
}

function testImportSource(useESM) {
  if (useESM) {
    return "import $__test from 'node:test';";
  }

  return "const $__test = require('node:test');";
}

function defaultExportSource(useESM, hasDefaultExport) {
  if (!hasDefaultExport) {
    return '';
  } else if (useESM) {
    return 'export default $__exports.defaultExport;';
  }

  return 'module.exports = $__exports.defaultExport;';
}

function namedExportsSource(useESM, exportNames) {
  let source = '';

  if (!useESM && exportNames.length > 0) {
    source += `
if (module.exports === null || typeof module.exports !== 'object') {
  throw new Error('${JSONStringify(kBadExportsMessage)}');
}
`;
  }

  for (let i = 0; i < exportNames.length; ++i) {
    const name = exportNames[i];

    if (useESM) {
      source += `export let ${name} = $__exports.namedExports[${JSONStringify(name)}];\n`;
    } else {
      source += `module.exports[${JSONStringify(name)}] = $__exports.namedExports[${JSONStringify(name)}];\n`;
    }
  }

  return source;
}

function preservedExportsSource(useESM, originalModuleReexports, originalModuleUrl) {
  let source = '';

  if (originalModuleReexports && originalModuleReexports.length) {
    if (useESM) {
      const reexportsStr = ArrayPrototypeJoin(originalModuleReexports, ', ');
      // TODO: probably need some more elegant (?) solution instead of this `someRandomParm`
      source += `export {${reexportsStr}} from "${originalModuleUrl}?someRandomParm=yes";\n`;
    } else {
      // TODO: support CJS
      source += `module.exports[${JSONStringify(name)}] = $__exports.mockedModuleOriginal[${JSONStringify(name)}];\n`;
    }
  }

  return source;
}

function sendAck(buf, status = kMockSuccess) {
  AtomicsStore(buf, 0, status);
  AtomicsNotify(buf, 0);
}

module.exports = { initialize, load, resolve };
