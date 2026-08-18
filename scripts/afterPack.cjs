const fs = require('node:fs');
const path = require('node:path');

function chmodIfExists(file) {
  try {
    fs.chmodSync(file, 0o755);
  } catch {
    /* missing in this build */
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') return;
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const whisper = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources', 'whisper');
  if (!fs.existsSync(whisper)) return;

  chmodIfExists(path.join(whisper, 'whisper-cli'));
  chmodIfExists(path.join(whisper, 'whisper-server'));
};
