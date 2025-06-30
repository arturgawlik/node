'use strict';
const {
  AtomicsNotify,
  AtomicsStore,
  JSONStringify,
  SafeMap,
  ArrayPrototypeIncludes,
  ArrayPrototypeJoin,
  ObjectKeys
} = primordials;
const {
  kBadExportsMessage,
  kMockSearchParam,
  kMockPreserveOriginalSearchParam,
  kMockSuccess,
  kMockExists,
  kMockUnknownMessage,
  getReexportsFromOriginal,
  // appendLoadOriginalParam
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
const originalModules = new SafeMap();

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

  let preservedExportLoad = false;
  if (mock.preserveOthers) {
    const parentURL = URLParse(context.parentURL);
    if (parentURL) {
      parentURL.searchParams.delete(kMockSearchParam);
      if (specifier === parentURL.href) {
        // it means this load is from "preserve exported" functionality
        // so we want to load original module 
        preservedExportLoad = true;
      }
    }
  }

  const url = new URL(mockSpecifier);
  url.searchParams.set(kMockSearchParam, mock.localVersion);
  if (preservedExportLoad) {
    url.searchParams.set(kMockPreserveOriginalSearchParam, true);
  }

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
  let preservedExportLoad = false;
  if (parsedURL) {
    preservedExportLoad = Boolean(parsedURL.searchParams.get(kMockPreserveOriginalSearchParam));
    parsedURL.searchParams.delete(kMockPreserveOriginalSearchParam);
    parsedURL.searchParams.delete(kMockSearchParam);
  }

  const baseURL = parsedURL ? parsedURL.href : url;
  const mock = mocks.get(baseURL);

  const original = await nextLoad(url, context);
  debug('load hook, mock = %o', mock);


  const returnOriginal = mock?.active !== true || preservedExportLoad;
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

  let originalModuleNamespace;
  if (mock.preserveOthers && format === 'module') {
    originalModuleNamespace = await getOriginalModule(baseURL);
  }

  const result = {
    __proto__: null,
    format,
    shortCircuit: true,
    source: await createSourceFromMock(mock, format, baseURL, originalModuleNamespace),
  };

  debug('load hook finished, result = %o', result);
  return result;
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
${preservedExportsSource(useESM, exportNames, hasDefaultExport, preserveOthers, originalModuleUrl, originalModuleNamespace)}
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

function preservedExportsSource(useESM, exportNames, hasDefaultExport, preserveOthers, originalModuleUrl, originalModuleNamespace) {
  let source = '';

  if (preserveOthers) {
    const originalModuleUrlWithParam = appendLoadOriginalParam(originalModuleUrl)

    if (useESM) {
      const namedReexportsFromOriginal = getReexportsFromOriginal(originalModuleNamespace, exportNames);
      const originalHasDefault = 'default' in originalModuleNamespace;
      const shouldExportDefault = originalHasDefault && !hasDefaultExport;
      if (namedReexportsFromOriginal.length === 0 && !shouldExportDefault) {
        return '';
      }

      if (shouldExportDefault) {
        source += `export { default } from '${originalModuleUrlWithParam}';\n`
      }
      source += `export { ${ArrayPrototypeJoin(namedReexportsFromOriginal, ', ')} } from '${originalModuleUrlWithParam}';\n`
    } else {
      if (hasDefaultExport) {
        return '';
      }
      const url = originalModuleUrl.replace('file://', '');
      const baseUrl = originalModuleUrl;
      source += `module.exports = require('${url}');\n`;
    }
  }

  return source;
}

function sendAck(buf, status = kMockSuccess) {
  AtomicsStore(buf, 0, status);
  AtomicsNotify(buf, 0);
}

async function getOriginalModule(originalModuleUrl) {
  if (originalModules.has(originalModuleUrl)) {
    // TODO: probably needs some invalidation? as mentioned in the issue
    // when given module is stopped to be mocked?
    return originalModules.get(originalModuleUrl);
  }

  const cascadedLoader = getLoader();
  const parentURL = getCWDURL().href;
  const originalModuleUrlWithParam = appendLoadOriginalParam(originalModuleUrl);
  const originalModuleNamespace = await cascadedLoader.import(`${originalModuleUrlWithParam}`, parentURL, kEmptyObject);
  originalModules.set(originalModuleUrl, originalModuleNamespace);

  return originalModuleNamespace;
}

function appendLoadOriginalParam(moduleUrl) {
  const url = new URL(moduleUrl);
  url.searchParams.append(kMockPreserveOriginalSearchParam, true);
  const originalModuleUrlWithParam = url.href;
  return originalModuleUrlWithParam;
}

// function removeLoadOriginalParam(moduleUrl) {
//   const url = new URL(moduleUrl);
//   if (url.searchParams.has(kMockPreserveOriginalSearchParam)) {
//     url.searchParams.remove(kMockPreserveOriginalSearchParam, true);
//   }
//   return url.href;
// }


let cascadedLoader;
function getLoader() {
  if (!cascadedLoader) {
    cascadedLoader = require('internal/modules/esm/loader').getOrInitializeCascadedLoader();
  }
  return cascadedLoader;
}

module.exports = { initialize, load, resolve };
