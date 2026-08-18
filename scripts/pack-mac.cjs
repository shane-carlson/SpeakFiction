#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { bumpVersion, current, nextBuild } = require('./version.cjs');

const root = path.join(__dirname, '..');
const extra = process.argv.slice(2);
const dirOnly = extra.includes('--dir');
const intelOnly = extra.includes('--intel') || extra.includes('--x64');
const allArches = extra.includes('--all');
const noBump = extra.includes('--no-bump') || extra.includes('--bump=none');
const keepBuild = extra.includes('--keep-build') || (intelOnly && !allArches && !extra.some((a) => a.startsWith('--bump=')));
const bumpArg = extra.find((a) => a.startsWith('--bump='))?.slice('--bump='.length);
const env = { ...process.env };

const canSign = Boolean(env.CSC_NAME || env.CSC_LINK || env.CSC_IDENTITY);
const canNotarize = Boolean(
  (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) ||
    (env.APPLE_ID && (env.APPLE_APP_SPECIFIC_PASSWORD || env.APPLE_PASSWORD) && env.APPLE_TEAM_ID),
);

if (!canSign) {
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

const builderFlags = extra.filter(
  (a) =>
    a !== '--no-bump' &&
    a !== '--bump=none' &&
    a !== '--intel' &&
    a !== '--x64' &&
    a !== '--all' &&
    a !== '--keep-build' &&
    !a.startsWith('--bump='),
);

if (!dirOnly && !noBump && !keepBuild) {
  const kind = ['major', 'minor', 'patch'].includes(bumpArg) ? bumpArg : 'patch';
  const exact = env.PACK_VERSION;
  const bumped = bumpVersion(kind, exact);
  console.log(`Version ${bumped.version}`);
}

const stamped = keepBuild ? current() : nextBuild();
if (keepBuild && !(stamped.buildNumber > 0)) {
  console.error('No build number yet. Run npm run pack:mac first, or omit --keep-build.');
  process.exit(1);
}
env.SF_APP_VERSION = stamped.version;
env.SF_BUILD_NUMBER = String(stamped.buildNumber);
console.log(`Build ${stamped.buildNumber} (${stamped.version})`);

const arches = allArches ? ['arm64', 'x64'] : intelOnly ? ['x64'] : ['arm64'];

run('npm', ['run', 'build:electron']);

for (const arch of arches) {
  const archEnv = { SF_MAC_ARCH: arch };
  run(
    process.execPath,
    [path.join(root, 'scripts', 'prepare-pack.cjs'), ...(arch === 'x64' ? ['--intel'] : [])],
    archEnv,
  );
  const builderArgs = [
    '--mac',
    `--${arch}`,
    '--config',
    path.join(root, 'electron-builder.config.cjs'),
    `--config.buildVersion=${stamped.buildNumber}`,
    ...builderFlags,
  ];
  if (canNotarize) builderArgs.push('--config.mac.notarize=true');
  else builderArgs.push('--config.mac.notarize=false');
  run(path.join(root, 'node_modules', '.bin', 'electron-builder'), builderArgs, archEnv);
  if (!dirOnly) archiveInstallers(stamped, arch);
}

function archiveInstallers({ version, buildNumber }, arch) {
  const scratch = path.join(root, 'release', 'scratch');
  const installers = path.join(root, 'release', 'installers');
  fs.mkdirSync(installers, { recursive: true });

  if (fs.existsSync(path.join(root, 'release'))) {
    for (const name of fs.readdirSync(path.join(root, 'release'))) {
      if (!/^SpeakFiction-.*\.(dmg|zip|blockmap)$/.test(name)) continue;
      const from = path.join(root, 'release', name);
      const to = path.join(installers, name);
      if (!fs.existsSync(to)) fs.copyFileSync(from, to);
    }
  }

  const copied = [];
  if (fs.existsSync(scratch)) {
    for (const name of fs.readdirSync(scratch)) {
      if (!/\.(dmg|zip|blockmap)$/.test(name)) continue;
      fs.copyFileSync(path.join(scratch, name), path.join(installers, name));
      copied.push(name);
    }
  }

  const dmg = copied.find((n) => n.endsWith('.dmg') && n.includes(`-${arch}.`)) ?? copied.find((n) => n.endsWith('.dmg')) ?? null;
  const zip = copied.find((n) => n.endsWith('.zip') && n.includes(`-${arch}.`)) ?? copied.find((n) => n.endsWith('.zip')) ?? null;
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
    version,
    buildNumber,
    builtAt: new Date().toISOString(),
    files: [...files],
    dmg: dmg || existing.dmg || null,
    zip: zip || existing.zip || null,
  };
  manifest.latest = entry;
  manifest.builds = [entry, ...builds.filter((b) => !(b.buildNumber === buildNumber && b.version === version))];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Archived ${arch} installer → release/installers/${dmg || zip || ''}`);
}
