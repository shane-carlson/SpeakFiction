#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { bumpVersion, current, nextBuild } = require('./version.cjs');

const root = path.join(__dirname, '..');
const extra = process.argv.slice(2);
const dirOnly = extra.includes('--dir');
const noBump = extra.includes('--no-bump') || extra.includes('--bump=none') || !extra.some((a) => a.startsWith('--bump='));
const keepBuild = extra.includes('--keep-build');
const bumpArg = extra.find((a) => a.startsWith('--bump='))?.slice('--bump='.length);
const env = { ...process.env, SF_WIN: '1' };

if (!env.CSC_NAME && !env.CSC_LINK && !env.CSC_IDENTITY) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runAllowFail(command, args, extraEnv = {}) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...env, ...extraEnv },
  });
}

const builderFlags = extra.filter(
  (a) =>
    a !== '--no-bump' &&
    a !== '--bump=none' &&
    a !== '--keep-build' &&
    a !== '--dir' &&
    !a.startsWith('--bump='),
);

if (!dirOnly && !noBump) {
  const kind = ['major', 'minor', 'patch'].includes(bumpArg) ? bumpArg : 'patch';
  const exact = env.PACK_VERSION;
  const bumped = bumpVersion(kind, exact);
  console.log(`Version ${bumped.version}`);
}

const stamped = keepBuild ? current() : nextBuild();
if (keepBuild && !(stamped.buildNumber > 0)) {
  console.error('No build number yet. Run npm run pack:win or npm run pack:mac first, or omit --keep-build.');
  process.exit(1);
}
env.SF_APP_VERSION = stamped.version;
env.SF_BUILD_NUMBER = String(stamped.buildNumber);
console.log(`Build ${stamped.buildNumber} (${stamped.version}) — Windows x64`);

run('npm', ['run', 'build:electron']);
run(process.execPath, [path.join(root, 'scripts', 'prepare-pack.cjs'), '--win']);

const builder = path.join(root, 'node_modules', '.bin', 'electron-builder');
const commonArgs = [
  '--win',
  '--x64',
  '--config',
  path.join(root, 'electron-builder.config.cjs'),
  `--config.buildVersion=${stamped.buildNumber}`,
  '--config.win.signAndEditExecutable=false',
  ...builderFlags,
];
if (!builderFlags.some((a) => a === '--publish' || a.startsWith('--publish='))) {
  commonArgs.push('--publish', 'never');
}

let packed = runAllowFail(builder, commonArgs);
if (packed.status !== 0) {
  console.warn('NSIS (or full Windows target) failed; retrying zip-only portable archive.');
  packed = runAllowFail(builder, [...commonArgs, '--config.win.target=zip']);
  if (packed.status !== 0) {
    process.exit(packed.status ?? 1);
  }
}

if (!dirOnly) archiveInstallers(stamped);

function archiveInstallers({ version, buildNumber }) {
  const scratch = path.join(root, 'release', 'scratch');
  const installers = path.join(root, 'release', 'installers');
  fs.mkdirSync(installers, { recursive: true });

  const copied = [];
  if (fs.existsSync(scratch)) {
    for (const name of fs.readdirSync(scratch)) {
      if (name === 'latest.yml') {
        fs.copyFileSync(path.join(scratch, name), path.join(installers, name));
        copied.push(name);
        continue;
      }
      if (!/\.(exe|zip|blockmap)$/.test(name)) continue;
      if (name.endsWith('.zip') && !/-win-/.test(name)) continue;
      if (name.endsWith('.blockmap') && !/-win-/.test(name)) continue;
      fs.copyFileSync(path.join(scratch, name), path.join(installers, name));
      copied.push(name);
    }
  }

  const exe =
    copied.find((n) => n.endsWith('.exe') && n.includes('-win-')) ??
    copied.find((n) => n.endsWith('.exe')) ??
    null;
  const zip =
    copied.find((n) => n.endsWith('.zip') && n.includes('-win-')) ??
    copied.find((n) => n.endsWith('.zip')) ??
    null;
  const manifestPath = path.join(installers, 'manifest.json');
  let manifest = { latest: null, builds: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      /* start fresh */
    }
  }
  const builds = Array.isArray(manifest.builds) ? manifest.builds : [];
  const existing = builds.find((b) => b.buildNumber === buildNumber && b.version === version) || {
    version,
    buildNumber,
    builtAt: new Date().toISOString(),
    files: [],
  };
  const files = new Set([...(existing.files || []), ...copied]);
  const entry = {
    ...existing,
    version,
    buildNumber,
    builtAt: new Date().toISOString(),
    files: [...files],
    exe: exe || existing.exe || null,
    winZip: zip || existing.winZip || null,
  };
  manifest.latest = entry;
  manifest.builds = [entry, ...builds.filter((b) => !(b.buildNumber === buildNumber && b.version === version))];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Archived Windows installer → release/installers/${exe || zip || ''}`);
}
