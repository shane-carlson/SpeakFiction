import { PERSIST_NAME } from './persistedState';

const SAVE_MS = 400;

let hydrated = false;
let timer = 0;
let pending: string | null = null;

function nativeState() {
  return window.speakfiction?.state;
}

function readLocal(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function writeLocal(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    /* quota / private mode — disk copy still saves in Electron */
  }
}

function writeDisk(json: string): void {
  const native = nativeState();
  if (native?.saveSync) {
    native.saveSync(json);
    return;
  }
  void native?.save?.(json);
}

/** Zustand persist string storage: Electron userData file, with localStorage fallback. */
export const sessionStateStorage = {
  getItem: (name: string): string | null => {
    const fromDisk = nativeState()?.loadSync?.();
    const candidates = [fromDisk, readLocal(name)];
    for (const value of candidates) {
      if (typeof value !== 'string' || !value.trim()) continue;
      try {
        JSON.parse(value);
      } catch {
        continue;
      }
      hydrated = true;
      writeLocal(name, value);
      return value;
    }
    hydrated = true;
    return null;
  },
  setItem: (name: string, value: string): void => {
    if (!hydrated) return;
    writeLocal(name, value);
    pending = value;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      const json = pending;
      pending = null;
      if (json) writeDisk(json);
    }, SAVE_MS);
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
    writeDisk('');
  },
};

export function flushSessionPersist(): void {
  if (timer) {
    window.clearTimeout(timer);
    timer = 0;
  }
  if (pending == null) return;
  const json = pending;
  pending = null;
  writeLocal(PERSIST_NAME, json);
  writeDisk(json);
}
