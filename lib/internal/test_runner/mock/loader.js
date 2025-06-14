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
  ArrayPrototypeJoin,
  ObjectKeys
} = primordials;
const {
  kBadExportsMessage,
  kMockSearchParam,
  kMockOriginalSearchParam,
  kMockSuccess,
  kMockExists,
  kMockUnknownMessage,
} = require('internal/test_runner/mock/mock');
const { URL, URLParse } = require('internal/url');
let debug = require('internal/util/debuglog').debuglog('test_runner', (fn) => {
  debug = fn;
});
const { kEmptyObject, getCWDURL } = require('internal/util');

// TODO(cjihrig): The mocks need to be thread aware because the exports are
// evaluated on the thread that creates the mock. Before marking this API as
// stable, one of the following issues needs to be implemented:
// https://github.com/nodejs/node/issues/49472
// or https://github.com/nodejs/node/issues/52219

const mocks = new SafeMap();
const originalModuleNamespaces = new SafeMap();

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
        format: payload.format,
        hasDefaultExport: payload.hasDefaultExport,
        localVersion,
        preserveOthers: payload.preserveOthers,
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
  let mockOriginalSearchParam = false;
  if (parsedURL) {
    mockOriginalSearchParam = Boolean(parsedURL.searchParams.get(kMockOriginalSearchParam));
    parsedURL.searchParams.delete(kMockSearchParam);
    // parsedURL.searchParams.delete(kMockOriginalSearchParam);
  }

  const baseURL = parsedURL ? parsedURL.href : url;
  const mock = mocks.get(baseURL);

  const original = await nextLoad(url, context);
  debug('load hook, mock = %o', mock);

  const returnOriginal = mock?.active !== true || mockOriginalSearchParam;
  if (returnOriginal) {
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

  // let originalModuleReexports;
  // if (mock.preserveOthers) {
  //   originalModuleReexports = createOriginalModuleSources(original.source, format, mock);
  //   await createOriginalModuleSourcesV2(baseURL, original.source, format, mock)
  // }
  let originalModuleNamespace;
  const originalModuleUrl = baseURL;
  if (mock.preserveOthers) {
    // const cascadedLoader = require('internal/modules/esm/loader').getOrInitializeCascadedLoader();
    // const parentURL = getCWDURL().href;
    // originalModuleNamespace = await cascadedLoader.import(`${originalModuleUrl}?someRandomParm=yes`, parentURL, kEmptyObject);
    originalModuleNamespace = await getOriginalModule(originalModuleUrl);
  }

  const result = {
    __proto__: null,
    format,
    shortCircuit: true,
    source: await createSourceFromMock(mock, format, originalModuleUrl, originalModuleNamespace),
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

// async function createOriginalModuleSourcesV2(originalUrl, originalSource, originalFormat, mock) {
//   const { exportNames: mockedExports, hasDefaultExport: mockHasDefault } = mock;

//   // const { stringify } = require('internal/modules/helpers');
//   // const originalSourceText = stringify(originalSource);

//   // const { compileSourceTextModule } = require('internal/modules/esm/utils');
//   // const wrap = compileSourceTextModule(originalUrl, originalSourceText);
//   const { importModuleDynamicallyCallback } = require('internal/modules/esm/utils');
//   const result = await importModuleDynamicallyCallback(originalUrl, originalUrl, {});
// }

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

async function createSourceFromMock(mock, format, originalModuleUrl, originalModuleNamespace) {
  // Create mock implementation from provided exports.
  const { exportNames, hasDefaultExport, url, preserveOthers } = mock;
  const useESM = format === 'module' || format === 'module-typescript';
  const source = `${testImportSource(useESM)}
if (!$__test.mock._mockExports.has(${JSONStringify(url)})) {
  throw new Error(${JSONStringify(`mock exports not found for "${url}"`)});
}

const $__exports = $__test.mock._mockExports.get(${JSONStringify(url)});
${preservedExportsSource2(useESM, exportNames, hasDefaultExport, preserveOthers, originalModuleUrl, originalModuleNamespace)}
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

// function preservedExportsSource(useESM, originalModuleReexports, originalModuleUrl) {
//   let source = '';

//   if (originalModuleReexports && originalModuleReexports.length) {
//     if (useESM) {
//       const reexportsStr = ArrayPrototypeJoin(originalModuleReexports, ', ');
//       // TODO: probably need some more elegant (?) solution instead of this `someRandomParm`
//       source += `export {${reexportsStr}} from "${originalModuleUrl}?someRandomParm=yes";\n`;
//     } else {
//       // TODO: support CJS
//       source += `module.exports[${JSONStringify(name)}] = $__exports.mockedModuleOriginal[${JSONStringify(name)}];\n`;
//     }
//   }

//   return source;
// }

function preservedExportsSource2(useESM, exportNames, hasDefaultExport, preserveOthers, originalModuleUrl, originalModuleNamespace) {
  let source = '';

  if (preserveOthers) {
    const namedReexportsFromOriginal = ObjectKeys(originalModuleNamespace).filter(exportName => exportName !== 'default' && !ArrayPrototypeIncludes(exportNames, exportName));
    const originalHasDefault = 'default' in originalModuleNamespace;
    const shouldExportDefault = originalHasDefault && !hasDefaultExport
    const originalModuleUrlWithParam = appendLoadOriginalParam(originalModuleUrl)

    if (namedReexportsFromOriginal.length === 0 && !shouldExportDefault) {
      return source;
    }

    if (useESM) {
      source += `export { ${ArrayPrototypeJoin(namedReexportsFromOriginal, ', ')} } from '${originalModuleUrlWithParam}';`
      if (shouldExportDefault) {
        source += `export { default } from '${originalModuleUrlWithParam}';`
      }
    } else {
      // TODO: support CJS
    }
  }

  return source;
}

function sendAck(buf, status = kMockSuccess) {
  AtomicsStore(buf, 0, status);
  AtomicsNotify(buf, 0);
}

async function getOriginalModule(originalModuleUrl) {
  const cascadedLoader = getLoader();
  const parentURL = getCWDURL().href;
  const originalModuleUrlWithParam = appendLoadOriginalParam(originalModuleUrl);
  const originalModuleNamespace = await cascadedLoader.import(`${originalModuleUrlWithParam}`, parentURL, kEmptyObject);

  return originalModuleNamespace;
}

function appendLoadOriginalParam(originalModuleUrl) {
  const url = new URL(originalModuleUrl);
  url.searchParams.append(kMockOriginalSearchParam, true);
  const originalModuleUrlWithParam = url.href;
  return originalModuleUrlWithParam;
}


let cascadedLoader;
function getLoader() {
  if (!cascadedLoader) {
    cascadedLoader = require('internal/modules/esm/loader').getOrInitializeCascadedLoader();
  }
  return cascadedLoader;
}

module.exports = { initialize, load, resolve };
