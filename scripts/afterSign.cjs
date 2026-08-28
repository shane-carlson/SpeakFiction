const fs = require('node:fs');
const path = require('node:path');
const { embedWinIcon } = require('./embed-win-icon.cjs');

// afterPack is too early: electron-builder then runs Wine rcedit --set-icon
// and truncates 128/256. afterSign runs after that, so the zip/NSIS exe keep
// the full icon group.
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const packedIco = path.join(context.appOutDir, 'resources', 'icon.ico');
  const ico = path.join(context.packager.projectDir, 'build', 'icon.ico');
  const iconFile = fs.existsSync(packedIco) ? packedIco : ico;
  if (!fs.existsSync(iconFile)) {
    throw new Error('Windows pack is missing icon.ico');
  }
  if (!fs.existsSync(exe)) {
    throw new Error(`Windows pack is missing ${exe}`);
  }
  const result = embedWinIcon(exe, iconFile);
  const truncated = result.gaps.map((g) => `${g.size}px`).join(', ');
  if (truncated) {
    console.log(`Rewrote Windows exe icon after rcedit (truncated ${truncated})`);
  }
};
