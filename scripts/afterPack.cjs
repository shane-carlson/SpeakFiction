const fs = require('node:fs');
const path = require('node:path');
const { embedWinIcon } = require('./embed-win-icon.cjs');

function chmodIfExists(file) {
  try {
    fs.chmodSync(file, 0o755);
  } catch {
    /* missing in this build */
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') {
    const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
    const ico = path.join(context.packager.projectDir, 'build', 'icon.ico');
    const packedIco = path.join(context.appOutDir, 'resources', 'icon.ico');
    if (fs.existsSync(ico) && !fs.existsSync(packedIco)) {
      fs.mkdirSync(path.dirname(packedIco), { recursive: true });
      fs.copyFileSync(ico, packedIco);
    }
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
      console.log(`Rewrote Windows exe icon (Wine rcedit had truncated ${truncated})`);
    }
    return;
  }
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const whisper = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources', 'whisper');
  if (!fs.existsSync(whisper)) return;

  chmodIfExists(path.join(whisper, 'whisper-cli'));
  chmodIfExists(path.join(whisper, 'whisper-server'));
};
