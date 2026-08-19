// Preload bridge. The renderer runs with context isolation; this is the
// seam where native capabilities (microphone access, system sound
// settings, on-device Whisper, file dialogs) are exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('speakfiction', {
  platform: process.platform,
  arch: process.arch,
  version: process.versions.electron,
  audio: {
    getMicStatus: () => ipcRenderer.invoke('audio:mic-status'),
    requestMic: () => ipcRenderer.invoke('audio:request-mic'),
    openSoundSettings: () => ipcRenderer.invoke('audio:open-sound-settings'),
    openMicPrivacySettings: () => ipcRenderer.invoke('audio:open-mic-privacy'),
  },
  stt: {
    getProfile: () => ipcRenderer.invoke('stt:profile'),
    ensure: () => ipcRenderer.invoke('stt:ensure'),
    transcribe: (samples, sampleRate) => ipcRenderer.invoke('stt:transcribe', { samples, sampleRate }),
    cacheMatch: (url) => ipcRenderer.invoke('stt:cache-match', url),
    cachePut: (url, bytes) => ipcRenderer.invoke('stt:cache-put', url, bytes),
  },
  files: {
    saveText: (opts) => ipcRenderer.invoke('files:save-text', opts),
    saveBytes: (opts) => ipcRenderer.invoke('files:save-bytes', opts),
    openText: (opts) => ipcRenderer.invoke('files:open-text', opts),
  },
  handoff: {
    getStatus: () => ipcRenderer.invoke('handoff:status'),
    requestAccess: () => ipcRenderer.invoke('handoff:request'),
    openPrivacySettings: () => ipcRenderer.invoke('handoff:open-privacy'),
    send: (appId, payload) => ipcRenderer.invoke('handoff:send', appId, payload),
  },
  license: {
    getStatus: () => ipcRenderer.invoke('license:status'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
    buy: () => ipcRenderer.invoke('license:buy'),
  },
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb) => {
      const listener = (_event, next) => cb(next);
      ipcRenderer.on('updater:event', listener);
      return () => ipcRenderer.removeListener('updater:event', listener);
    },
  },
});
