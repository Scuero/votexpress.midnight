const fs = require('fs');
const path = require('path');

const packagesToFix = [
  '@midnight-ntwrk/compact-js',
  '@midnight-ntwrk/platform-js',
  '@midnight-ntwrk/wallet-sdk-address-format',
  '@midnight-ntwrk/dapp-connector-api',
];

function patchExports(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(patchExports);

  const res = {};
  for (const key of Object.keys(obj)) {
    let val = obj[key];
    if (typeof val === 'string') {
      val = val.replace(/\/dist\/cjs\//g, '/dist/esm/');
    } else if (typeof val === 'object') {
      val = patchExports(val);
      if (key === '.' || key.startsWith('./')) {
        if (!val.default) {
          if (val.import) val.default = val.import;
          else if (val.module) val.default = val.module;
        }
      }
    }
    res[key] = val;
  }
  return res;
}

for (const pkg of packagesToFix) {
  const pkgPath = path.join(__dirname, '..', 'node_modules', ...pkg.split('/'), 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const json = JSON.parse(raw);
      if (json.exports) {
        json.exports = patchExports(json.exports);
        fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2), 'utf8');
        console.log(`✅ Patched all subpath exports for ${pkg}`);
      }
    } catch (e) {
      console.warn(`Could not patch ${pkg}:`, e.message);
    }
  }
}
