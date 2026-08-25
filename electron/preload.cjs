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
    onProgress: (cb) => {
      const listener = (_event, percent) => cb(percent);
      ipcRenderer.on('stt:progress', listener);
      return () => ipcRenderer.removeListener('stt:progress', listener);
    },
    transcribe: (samples, sampleRate, prompt) =>
      ipcRenderer.invoke('stt:transcribe', { samples, sampleRate, prompt }),
    unload: () => ipcRenderer.invoke('stt:unload'),
    cacheMatch: (url) => ipcRenderer.invoke('stt:cache-match', url),
    cachePut: (url, bytes) => ipcRenderer.invoke('stt:cache-put', url, bytes),
  },
  files: {
    saveText: (opts) => ipcRenderer.invoke('files:save-text', opts),
    saveBytes: (opts) => ipcRenderer.invoke('files:save-bytes', opts),
    openText: (opts) => ipcRenderer.invoke('files:open-text', opts),
    openBytes: (opts) => ipcRenderer.invoke('files:open-bytes', opts),
  },
  media: {
    save: (opts) => ipcRenderer.invoke('media:save', opts),
    load: (id) => ipcRenderer.invoke('media:load', id),
    remove: (id) => ipcRenderer.invoke('media:remove', id),
  },
  state: {
    loadSync: () => ipcRenderer.sendSync('state:load'),
    save: (json) => ipcRenderer.invoke('state:save', json),
    saveSync: (json) => ipcRenderer.sendSync('state:save-sync', json),
  },
  handoff: {
    getStatus: () => ipcRenderer.invoke('handoff:status'),
    requestAccess: () => ipcRenderer.invoke('handoff:request'),
    openPrivacySettings: () => ipcRenderer.invoke('handoff:open-privacy'),
    relaunch: () => ipcRenderer.invoke('handoff:relaunch'),
    send: (appId, payload) => ipcRenderer.invoke('handoff:send', appId, payload),
    onStatus: (cb) => {
      const listener = (_event, next) => cb(next);
      ipcRenderer.on('handoff:status', listener);
      return () => ipcRenderer.removeListener('handoff:status', listener);
    },
  },
  license: {
    getStatus: () => ipcRenderer.invoke('license:status'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
    buy: () => ipcRenderer.invoke('license:buy'),
  },
  notes: {
    getStatus: () => ipcRenderer.invoke('notes:status'),
    getPairing: () => ipcRenderer.invoke('notes:pairing'),
    list: () => ipcRenderer.invoke('notes:list'),
    refresh: () => ipcRenderer.invoke('notes:refresh'),
    addLocal: (note) => ipcRenderer.invoke('notes:add-local', note),
    setStatus: (id, status, extra) => ipcRenderer.invoke('notes:set-status', id, status, extra),
    publishLibrary: (books) => ipcRenderer.invoke('notes:publish-library', books),
    readAudio: (id) => ipcRenderer.invoke('notes:read-audio', id),
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
  whatsNew: {
    getPending: () => ipcRenderer.invoke('whatsNew:pending'),
    clearPending: () => ipcRenderer.invoke('whatsNew:clear'),
  },
  help: {
    submitTicket: (payload) => ipcRenderer.invoke('help:submit-ticket', payload),
    onOpenTicket: (cb) => {
      const listener = (_event, kind) => cb(kind);
      ipcRenderer.on('help:open-ticket', listener);
      return () => ipcRenderer.removeListener('help:open-ticket', listener);
    },
  },
  spellcheck: {
    onContextMenu: (cb) => {
      const listener = (_event, payload) => cb(payload);
      ipcRenderer.on('spellcheck:context-menu', listener);
      return () => ipcRenderer.removeListener('spellcheck:context-menu', listener);
    },
    replace: (word) => ipcRenderer.send('spellcheck:replace', word),
    addWord: (word) => ipcRenderer.send('spellcheck:add-word', word),
  },
});
