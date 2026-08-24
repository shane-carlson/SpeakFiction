import * as SecureStore from 'expo-secure-store';

async function asyncStore() {
  try {
    return (await import('@react-native-async-storage/async-storage')).default;
  } catch {
    return null;
  }
}
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  isThemeId,
  isThemeMode,
  type ThemeId,
  type ThemeMode,
} from './theme';

const PREFS_KEY = 'sf-companion-prefs';
const MODE_STORE = 'sf-companion-mode';
const THEME_STORE = 'sf-companion-theme';
const TRANSCRIBE_STORE = 'sf-companion-transcribe';

export type CompanionPrefs = {
  mode: ThemeMode;
  themeId: ThemeId;
  transcribeOnPhone: boolean;
  bookId: string | null;
  bookTitle: string | null;
};

export const DEFAULT_COMPANION_PREFS: CompanionPrefs = {
  mode: DEFAULT_THEME_MODE,
  themeId: DEFAULT_THEME_ID,
  transcribeOnPhone: true,
  bookId: null,
  bookTitle: null,
};

let cached: CompanionPrefs = { ...DEFAULT_COMPANION_PREFS };
let hydrated = false;

export function getCachedPrefs(): CompanionPrefs {
  return cached;
}

export function parseCompanionPrefs(raw: string | null | undefined): CompanionPrefs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bookId = typeof parsed.bookId === 'string' && parsed.bookId.trim() ? parsed.bookId.trim() : null;
    const bookTitle = typeof parsed.bookTitle === 'string' && parsed.bookTitle.trim() ? parsed.bookTitle.trim() : null;
    return {
      mode: isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_THEME_MODE,
      themeId: isThemeId(parsed.themeId) ? parsed.themeId : DEFAULT_THEME_ID,
      transcribeOnPhone: parsed.transcribeOnPhone === false || parsed.transcribeOnPhone === 0 || parsed.transcribeOnPhone === '0'
        ? false
        : true,
      bookId,
      bookTitle: bookId ? bookTitle : null,
    };
  } catch {
    return null;
  }
}

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecure(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Android without a lock screen rejects SecureStore; AsyncStorage still holds prefs.
  }
}

async function readAsync(key: string): Promise<string | null> {
  try {
    return (await asyncStore())?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

async function writeAsync(key: string, value: string): Promise<void> {
  try {
    await (await asyncStore())?.setItem(key, value);
  } catch {
    // Native module missing until the next native build; SecureStore still holds prefs.
  }
}

async function readLegacyPrefs(): Promise<CompanionPrefs | null> {
  const [mode, themeId, transcribe] = await Promise.all([
    readSecure(MODE_STORE),
    readSecure(THEME_STORE),
    readSecure(TRANSCRIBE_STORE),
  ]);
  if (mode == null && themeId == null && transcribe == null) return null;
  return {
    mode: isThemeMode(mode) ? mode : DEFAULT_THEME_MODE,
    themeId: isThemeId(themeId) ? themeId : DEFAULT_THEME_ID,
    transcribeOnPhone: transcribe !== '0',
    bookId: null,
    bookTitle: null,
  };
}

export async function loadCompanionPrefs(): Promise<CompanionPrefs> {
  const fromAsync = parseCompanionPrefs(await readAsync(PREFS_KEY));
  const fromSecure = parseCompanionPrefs(await readSecure(PREFS_KEY));
  const fromLegacy = await readLegacyPrefs();
  const loaded = fromAsync ?? fromSecure ?? fromLegacy;
  cached = loaded ?? { ...DEFAULT_COMPANION_PREFS };
  hydrated = true;
  if (loaded && !fromAsync) await persistCompanionPrefs(cached);
  return cached;
}

export async function persistCompanionPrefs(next: Partial<CompanionPrefs>): Promise<CompanionPrefs> {
  cached = { ...(hydrated ? cached : DEFAULT_COMPANION_PREFS), ...next };
  const json = JSON.stringify(cached);
  await Promise.all([
    writeAsync(PREFS_KEY, json),
    writeSecure(PREFS_KEY, json),
    writeSecure(MODE_STORE, cached.mode),
    writeSecure(THEME_STORE, cached.themeId),
    writeSecure(TRANSCRIBE_STORE, cached.transcribeOnPhone ? '1' : '0'),
  ]);
  return cached;
}
