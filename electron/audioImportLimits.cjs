/** Byte cap for desktop audio import. Keep in lockstep with src/core/audioImport.ts. */
const MAX_AUDIO_IMPORT_BYTES = 40 * 1024 * 1024;
const AUDIO_IMPORT_TOO_LARGE_MESSAGE = 'That audio file is too large to import (40 MB limit).';

function messageIfAudioTooLarge(byteLength) {
  if (typeof byteLength !== 'number' || !Number.isFinite(byteLength)) return null;
  if (byteLength <= MAX_AUDIO_IMPORT_BYTES) return null;
  return AUDIO_IMPORT_TOO_LARGE_MESSAGE;
}

module.exports = {
  MAX_AUDIO_IMPORT_BYTES,
  AUDIO_IMPORT_TOO_LARGE_MESSAGE,
  messageIfAudioTooLarge,
};
