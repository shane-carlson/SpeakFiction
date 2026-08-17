// Preload bridge. The renderer runs with context isolation; this is the
// seam where future native-macOS capabilities (Accessibility text injection
// into Scrivener/Word, on-device LLM inference) are exposed safely.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('speakfiction', {
  platform: process.platform,
  version: process.versions.electron,
});
