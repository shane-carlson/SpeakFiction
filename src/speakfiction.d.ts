export type MicAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export interface SpeakFictionAudioBridge {
  getMicStatus: () => Promise<MicAccessStatus>;
  requestMic: () => Promise<boolean>;
  openSoundSettings: () => Promise<void>;
  openMicPrivacySettings: () => Promise<void>;
}

export interface SpeakFictionSttBridge {
  getProfile: () => Promise<import('./core/sttProfile').SttProfile>;
  ensure: () => Promise<import('./core/sttProfile').SttProfile>;
  transcribe: (samples: number[] | Float32Array, sampleRate: number) => Promise<string>;
  cacheMatch: (url: string) => Promise<Uint8Array | null>;
  cachePut: (url: string, bytes: Uint8Array) => Promise<void>;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface HandoffTargetStatus {
  id: 'scrivener' | 'word' | 'libreoffice';
  name: string;
  installed: boolean;
  running: boolean;
}

export interface HandoffStatus {
  available: boolean;
  trusted: boolean;
  /** Name shown in Privacy & Security → Accessibility for this process. */
  clientName?: string;
  targets: HandoffTargetStatus[];
}

export interface HandoffSendResult {
  ok: boolean;
  app?: string;
  launched?: boolean;
  reason?: string;
  detail?: string;
  status?: HandoffStatus;
}

export interface SpeakFictionHandoffBridge {
  getStatus: () => Promise<HandoffStatus>;
  requestAccess: () => Promise<HandoffStatus>;
  openPrivacySettings: () => Promise<void>;
  relaunch: () => Promise<void>;
  send: (
    appId: 'scrivener' | 'word' | 'libreoffice',
    payload: { text: string; rtf?: string },
  ) => Promise<HandoffSendResult>;
  onStatus: (cb: (status: HandoffStatus) => void) => () => void;
}

export interface SpeakFictionStateBridge {
  loadSync: () => string | null;
  save: (json: string) => Promise<{ ok: boolean }>;
  saveSync: (json: string) => { ok: boolean };
}

export interface SpeakFictionFilesBridge {
  saveText: (opts: {
    defaultPath: string;
    content: string;
    filters?: FileFilter[];
  }) => Promise<{ ok: boolean; path?: string }>;
  saveBytes: (opts: {
    defaultPath: string;
    bytes: Uint8Array | number[];
    filters?: FileFilter[];
  }) => Promise<{ ok: boolean; path?: string }>;
  openText: (opts?: { filters?: FileFilter[] }) => Promise<{ ok: boolean; path?: string; content?: string }>;
  openBytes: (opts?: { filters?: FileFilter[] }) => Promise<{
    ok: boolean;
    path?: string;
    bytes?: Uint8Array | number[];
    mime?: string;
  }>;
}

export interface SpeakFictionMediaBridge {
  save: (opts: { id: string; mime: string; bytes: Uint8Array | number[] }) => Promise<{ ok: boolean }>;
  load: (id: string) => Promise<{ ok: boolean; mime?: string; bytes?: Uint8Array | number[] }>;
  remove: (id: string) => Promise<{ ok: boolean }>;
}

export interface SpeakFictionLicenseBridge {
  getStatus: () => Promise<import('./core/license').LicenseStatus>;
  activate: (key: string) => Promise<import('./core/license').LicenseActivateResult>;
  buy: () => Promise<{ ok: boolean; error?: string }>;
}

export interface SpeakFictionUpdaterBridge {
  getStatus: () => Promise<import('./core/update').UpdateStatus>;
  check: () => Promise<import('./core/update').UpdateStatus>;
  install: () => Promise<{ ok: boolean; error?: string }>;
  onStatus: (cb: (status: import('./core/update').UpdateStatus) => void) => () => void;
}

export interface SpeakFictionWhatsNewBridge {
  getPending: () => Promise<import('./core/whatsNew').PendingWhatsNew | null>;
  clearPending: () => Promise<{ ok: boolean }>;
}

export interface SpellcheckContextPayload {
  misspelledWord: string;
  dictionarySuggestions: string[];
}

export interface SpeakFictionSpellcheckBridge {
  onContextMenu: (cb: (payload: SpellcheckContextPayload) => void) => () => void;
  replace: (word: string) => void;
  addWord: (word: string) => void;
}

export interface SpeakFictionBridge {
  platform: string;
  arch?: string;
  version: string;
  audio?: SpeakFictionAudioBridge;
  stt?: SpeakFictionSttBridge;
  files?: SpeakFictionFilesBridge;
  media?: SpeakFictionMediaBridge;
  state?: SpeakFictionStateBridge;
  handoff?: SpeakFictionHandoffBridge;
  license?: SpeakFictionLicenseBridge;
  updater?: SpeakFictionUpdaterBridge;
  whatsNew?: SpeakFictionWhatsNewBridge;
  spellcheck?: SpeakFictionSpellcheckBridge;
}

declare global {
  interface Window {
    speakfiction?: SpeakFictionBridge;
  }
}

export {};
