const fs = require('node:fs');
const path = require('node:path');

function loadYaml(file) {
  const yaml = require('js-yaml');
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function dumpYaml(value) {
  const yaml = require('js-yaml');
  return yaml.dump(value, { lineWidth: 120 });
}

function mergeLatestMac(installersDir) {
  const parts = ['arm64', 'x64']
    .map((arch) => path.join(installersDir, `latest-mac-${arch}.yml`))
    .filter((file) => fs.existsSync(file))
    .map((file) => loadYaml(file))
    .filter(Boolean);

  if (!parts.length) return null;

  const merged = { ...parts[0], files: [] };
  const seen = new Set();
  for (const part of parts) {
    for (const file of part.files || []) {
      const url = file && file.url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      merged.files.push(file);
    }
  }

  const armZip = merged.files.find((f) => typeof f.url === 'string' && f.url.includes('arm64') && f.url.endsWith('.zip'));
  const anyZip = merged.files.find((f) => typeof f.url === 'string' && f.url.endsWith('.zip'));
  const primary = armZip || anyZip || merged.files[0];
  if (primary) {
    merged.path = primary.url;
    merged.sha512 = primary.sha512;
    if (primary.size) merged.size = primary.size;
  }

  const dest = path.join(installersDir, 'latest-mac.yml');
  fs.writeFileSync(dest, dumpYaml(merged));
  return dest;
}

module.exports = { mergeLatestMac };
