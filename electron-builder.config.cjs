const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const packingWin =
  process.env.SF_WIN === '1' || process.argv.some((a) => a === '--win' || a.startsWith('--win'));
const intel = process.env.SF_MAC_ARCH === 'x64';
const macArch = intel ? 'x64' : 'arm64';
const ico = path.join(__dirname, 'build', 'icon.ico');
if (packingWin && !fs.existsSync(ico)) {
  spawnSync(process.execPath, [path.join(__dirname, 'scripts', 'make-ico.cjs')], { stdio: 'inherit' });
}
const hasIco = fs.existsSync(ico);

function updaterModules() {
  const seen = new Set();
  function walk(name) {
    if (seen.has(name)) return;
    let pkgPath;
    try {
      pkgPath = require.resolve(`${name}/package.json`, { paths: [__dirname] });
    } catch {
      return;
    }
    seen.add(name);
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      return;
    }
    for (const dep of Object.keys(pkg.dependencies || {})) walk(dep);
  }
  walk('electron-updater');
  return [...seen].map((name) => `node_modules/${name}/**/*`);
}

function whisperExtraResources() {
  if (packingWin) {
    const winBin = path.join(__dirname, 'models', 'bin-win-x64');
    const cli = path.join(winBin, 'whisper-cli.exe');
    if (fs.existsSync(cli) && fs.statSync(cli).size > 10_000) {
      return [
        {
          from: 'models/bin-win-x64',
          to: 'whisper',
          filter: ['whisper-cli.exe', 'whisper-server.exe', '*.dll'],
        },
      ];
    }
    return [];
  }
  const whisperFrom = intel ? 'models/bin-x64' : 'models/bin';
  return [
    {
      from: whisperFrom,
      to: 'whisper',
      filter: ['whisper-cli', 'whisper-server', '*.dylib'],
    },
  ];
}

module.exports = {
  appId: 'net.speakfiction.app',
  productName: 'SpeakFiction',
  copyright: 'Copyright © SpeakFiction',
  asar: true,
  npmRebuild: false,
  electronLanguages: ['en'],
  directories: {
    output: 'release/scratch',
    buildResources: 'build',
  },
  files: ['package.json', 'dist/**/*', 'electron/**/*.cjs', '!**/node_modules/**', ...updaterModules()],
  extraResources: [
    ...whisperExtraResources(),
    {
      from: 'public/speakfiction-logo.png',
      to: 'speakfiction-logo.png',
    },
    ...(packingWin && hasIco ? [{ from: 'build/icon.ico', to: 'icon.ico' }] : []),
  ],
  afterPack: './scripts/afterPack.cjs',
  publish: {
    provider: 'github',
    owner: 'shane-carlson',
    repo: 'SpeakFiction',
    releaseType: 'release',
  },
  mac: {
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.inherit.plist',
    minimumSystemVersion: '12.0',
    artifactName: '${productName}-${version}-b${env.SF_BUILD_NUMBER}-${arch}.${ext}',
    target: [
      { target: 'dmg', arch: [macArch] },
      { target: 'zip', arch: [macArch] },
    ],
    extendInfo: {
      NSMicrophoneUsageDescription:
        'SpeakFiction uses the microphone to dictate your manuscript. Audio stays on this Mac.',
      NSAppleEventsUsageDescription: 'SpeakFiction inserts your manuscript into Scrivener and Word.',
      NSAccessibilityUsageDescription:
        'SpeakFiction uses Accessibility to paste dictated text into Scrivener and Word.',
      CFBundleDisplayName: 'SpeakFiction',
      CFBundleName: 'SpeakFiction',
    },
  },
  dmg: {
    title: intel ? 'SpeakFiction ${version} Intel' : 'SpeakFiction ${version}',
    artifactName: '${productName}-${version}-b${env.SF_BUILD_NUMBER}-${arch}.${ext}',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  win: {
    icon: 'build/icon.ico',
    artifactName: '${productName}-${version}-b${env.SF_BUILD_NUMBER}-win-${arch}.${ext}',
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'SpeakFiction',
    deleteAppDataOnUninstall: false,
    artifactName: '${productName}-${version}-b${env.SF_BUILD_NUMBER}-win-${arch}.${ext}',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
  },
};
