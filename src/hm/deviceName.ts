/** Label for the device that produced keyboard certification (display only; not part of the seal hash). */

export type HumanuscriptBridge = {
  getDeviceName?: () => Promise<string> | string;
  /** Electron built-in dictionary. Absent in a browser that cannot read suggestions. */
  getSpellSuggestions?: (word: string) => string[];
};

declare global {
  interface Window {
    humanuscript?: HumanuscriptBridge;
  }
}

/** Stored on older cards when the browser could not name the computer. Display replaces it. */
export const UNAVAILABLE_DEVICE_LABEL = 'Device name unavailable in this browser';

export type PlatformHints = {
  userAgent?: string;
  platform?: string;
  brands?: Array<{ brand: string }>;
};

let cached: string | null | undefined;

function cleanLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pageWindow(): Window | undefined {
  return (globalThis as { window?: Window }).window;
}

type UaData = {
  platform?: string;
  brands?: Array<{ brand: string }>;
};

function readNavigatorHints(): PlatformHints {
  const nav = (globalThis as { navigator?: Navigator & { userAgentData?: UaData } }).navigator;
  if (!nav) return {};
  return {
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform || nav.platform,
    brands: nav.userAgentData?.brands,
  };
}

function osLabel(platform: string, userAgent: string): string | null {
  const blob = `${platform} ${userAgent}`;
  if (/iphone/i.test(blob)) return 'iPhone';
  if (/ipad/i.test(blob)) return 'iPad';
  if (/android/i.test(blob)) return 'Android';
  if (/cros|chrome\s?os/i.test(blob)) return 'ChromeOS';
  if (/mac os|macintosh|macintel|\bmac\b/i.test(blob)) return 'Mac';
  if (/windows|win32|win64/i.test(blob)) return 'Windows';
  if (/linux/i.test(blob)) return 'Linux';
  return null;
}

function browserLabel(userAgent: string, brands: Array<{ brand: string }>): string | null {
  const usable = brands.filter((item) => item.brand && !/not.?a.?brand/i.test(item.brand) && !/^chromium$/i.test(item.brand));
  const named: Array<[RegExp, string]> = [
    [/edge/i, 'Edge'],
    [/opera/i, 'Opera'],
    [/brave/i, 'Brave'],
    [/firefox/i, 'Firefox'],
    [/chrome/i, 'Chrome'],
    [/safari/i, 'Safari'],
  ];
  for (const [pattern, label] of named) {
    if (usable.some((item) => pattern.test(item.brand))) return label;
  }
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/OPR\/|Opera/.test(userAgent)) return 'Opera';
  if (/Brave/i.test(userAgent)) return 'Brave';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent) && !/Chrome|Chromium/.test(userAgent)) return 'Safari';
  if (/Chromium/i.test(userAgent)) return 'Chromium';
  return null;
}

/**
 * Short browser label such as "Mac · Chrome".
 * This is not a hostname. When the OS or browser cannot be read, returns null.
 */
export function shortPlatformLabel(hints?: PlatformHints): string | null {
  const source = hints ?? readNavigatorHints();
  const os = osLabel(source.platform ?? '', source.userAgent ?? '');
  const browser = browserLabel(source.userAgent ?? '', source.brands ?? []);
  if (os && browser) return `${os} · ${browser}`;
  return os || browser;
}

function usableName(value: string | null | undefined): string | null {
  const cleaned = cleanLabel(value);
  if (!cleaned || cleaned === UNAVAILABLE_DEVICE_LABEL) return null;
  return cleaned;
}

type DeviceBridge = {
  getName?: () => Promise<string> | string;
};

function desktopNameBridge(): (() => Promise<string> | string) | null {
  const win = pageWindow() as (Window & { speakfiction?: { device?: DeviceBridge } }) | undefined;
  const fromSpeakFiction = win?.speakfiction?.device?.getName;
  if (typeof fromSpeakFiction === 'function') return fromSpeakFiction;
  const fromHumanuscript = win?.humanuscript?.getDeviceName;
  return typeof fromHumanuscript === 'function' ? fromHumanuscript : null;
}

async function hostnameFromDesktop(): Promise<string | null> {
  try {
    const bridge = desktopNameBridge();
    if (!bridge) return null;
    return usableName(await Promise.resolve(bridge()));
  } catch {
    return null;
  }
}

/** Last resolved label, or the platform label before the desktop hostname arrives. */
export function currentTypingDeviceLabel(): string | null {
  return cached !== undefined ? cached : shortPlatformLabel();
}

/** Electron: machine hostname. Browser: short platform label. Never invents a hostname. */
export async function getTypingDeviceLabel(): Promise<string | null> {
  if (cached !== undefined) return cached;
  const hostname = await hostnameFromDesktop();
  if (hostname) {
    cached = hostname;
    return hostname;
  }
  cached = shortPlatformLabel();
  return cached;
}

export function clearTypingDeviceLabelCache(): void {
  cached = undefined;
}

/**
 * Card line value. A saved apology is replaced with the live hostname or platform label.
 * Returns null when there is nothing honest to show, so the caller omits the line.
 */
export function formatTypingDeviceLabel(label: string | null | undefined, live?: string | null): string | null {
  const stored = usableName(label);
  if (stored) return stored;
  const fallback = live === undefined ? shortPlatformLabel() : usableName(live);
  return fallback;
}
