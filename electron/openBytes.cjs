const fs = require('node:fs/promises');
const limits = require('./audioImportLimits.cjs');

/**
 * Read a chosen file only when it is within maxBytes.
 * Oversized audio must fail here so the bytes never enter the renderer.
 */
async function readBytesIfAllowed(filePath, opts) {
  const maxBytes = Number(opts?.maxBytes);
  if (Number.isFinite(maxBytes) && maxBytes > 0) {
    const size = (await fs.stat(filePath)).size;
    if (size > maxBytes) {
      const custom = typeof opts?.tooLargeMessage === 'string' ? opts.tooLargeMessage.trim() : '';
      return {
        ok: false,
        path: filePath,
        message: custom || limits.messageIfAudioTooLarge(size) || 'That file is too large to open.',
      };
    }
  }
  const bytes = await fs.readFile(filePath);
  return { ok: true, path: filePath, bytes };
}

module.exports = { readBytesIfAllowed };
