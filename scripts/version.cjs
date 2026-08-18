const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

function readPkg() {
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function bumpSemver(version, kind) {
  const parts = String(version).split('.').map((n) => parseInt(n, 10));
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function setLockVersion(version) {
  if (!fs.existsSync(lockPath)) return;
  const text = fs.readFileSync(lockPath, 'utf8');
  const next = text.replace(
    /("name": "speakfiction",\n\s*"version": ")[^"]+(")/g,
    `$1${version}$2`,
  );
  if (next !== text) fs.writeFileSync(lockPath, next);
}

function current() {
  const pkg = readPkg();
  return {
    version: String(pkg.version || '0.0.0'),
    buildNumber: Number(pkg.buildNumber) > 0 ? Number(pkg.buildNumber) : 0,
  };
}

/** Stamp a unique CFBundleVersion. Always call this when packing. */
function nextBuild() {
  const pkg = readPkg();
  const buildNumber = (Number(pkg.buildNumber) > 0 ? Number(pkg.buildNumber) : 0) + 1;
  pkg.buildNumber = buildNumber;
  writeJson(pkgPath, pkg);
  return { version: pkg.version, buildNumber };
}

function bumpVersion(kind, exact) {
  const pkg = readPkg();
  pkg.version = exact || bumpSemver(pkg.version, kind || 'patch');
  writeJson(pkgPath, pkg);
  setLockVersion(pkg.version);
  return { version: pkg.version, buildNumber: Number(pkg.buildNumber) || 0 };
}

module.exports = { bumpSemver, current, nextBuild, bumpVersion };
