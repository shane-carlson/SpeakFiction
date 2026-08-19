import { normalizeLastSeenVersion } from './persistedState';

export const GITHUB_REPO = 'shane-carlson/SpeakFiction';

export type WhatsNewSource = 'pending' | 'github' | 'bundled';

export type NotesBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export interface PendingWhatsNew {
  version: string;
  notes: string;
  name?: string;
}

/** Display/persist id, e.g. `0.1.6-b11`. */
export function appVersionId(version: string, build: string | number = ''): string {
  const v = String(version ?? '').trim().replace(/^v/i, '');
  const b = String(build ?? '').trim();
  if (!v) return b && b !== '0' ? `b${b}` : '';
  if (!b || b === '0') return v;
  return `${v}-b${b}`;
}

export interface WhatsNewContext {
  /** True when this launch loaded library-state / zustand persist from disk. */
  hasPriorSession?: boolean;
  /** True when electron-updater left pending What’s New notes for this restart. */
  hasPendingNotes?: boolean;
}

/**
 * Show What’s New after an upgrade, not on a true first install.
 *
 * Missing lastSeenVersion is ambiguous: 0.1.6 never wrote it, so an auto-update
 * to 0.1.7 must not be treated as a first launch. Use prior session or pending
 * updater notes to distinguish those upgrades.
 */
export function shouldShowWhatsNew(
  lastSeenVersion: string | null | undefined,
  currentVersion: string,
  context: WhatsNewContext = {},
): boolean {
  const current = String(currentVersion ?? '').trim();
  if (!current) return false;
  const seen = normalizeLastSeenVersion(lastSeenVersion);
  if (seen === current) return false;
  if (context.hasPendingNotes) return true;
  if (seen) return true;
  return Boolean(context.hasPriorSession);
}

/**
 * Stamp lastSeenVersion on launch only for a true first install. Upgrades keep
 * lastSeenVersion unset until the user dismisses What’s New.
 */
export function shouldRecordLastSeenOnLaunch(
  lastSeenVersion: string | null | undefined,
  currentVersion: string,
  context: WhatsNewContext = {},
): boolean {
  const current = String(currentVersion ?? '').trim();
  if (!current) return false;
  if (normalizeLastSeenVersion(lastSeenVersion)) return false;
  return !shouldShowWhatsNew(lastSeenVersion, current, context);
}

export function pendingNotesIndicateUpdate(pending: PendingWhatsNew | null | undefined): boolean {
  if (!pending) return false;
  return Boolean(pending.notes?.trim() || pending.version?.trim());
}

export function githubReleaseTag(version: string, build: string | number = ''): string {
  const id = appVersionId(version, build);
  return id ? `v${id}` : '';
}

export function githubReleaseApiUrl(version: string, build: string | number = ''): string {
  const tag = githubReleaseTag(version, build);
  return `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`;
}

export function githubLatestReleaseApiUrl(): string {
  return `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
}

export function githubReleaseCandidateUrls(version: string, build: string | number = ''): string[] {
  const urls: string[] = [];
  const v = String(version ?? '').trim().replace(/^v/i, '');
  const b = String(build ?? '').trim();
  if (v && b && b !== '0') urls.push(githubReleaseApiUrl(v, b));
  if (v) urls.push(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(`v${v}`)}`);
  urls.push(githubLatestReleaseApiUrl());
  return [...new Set(urls)];
}

export function releaseTagMatches(tag: string, version: string, build: string | number = ''): boolean {
  const t = String(tag ?? '').trim().replace(/^v/i, '');
  const v = String(version ?? '').trim().replace(/^v/i, '');
  if (!t || !v) return false;
  const b = String(build ?? '').trim();
  if (b && b !== '0' && t === `${v}-b${b}`) return true;
  if (t === v) return true;
  return t.startsWith(`${v}-b`);
}

export function notesMatchVersion(pendingVersion: string | null | undefined, currentVersion: string): boolean {
  const pending = String(pendingVersion ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('-b')[0];
  const current = String(currentVersion ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('-b')[0];
  return Boolean(pending && current && pending === current);
}

/** Flatten electron-updater `releaseNotes` (string or versioned array). */
export function normalizeReleaseNotes(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (!Array.isArray(raw)) return '';
  return raw
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const note = (item as { note?: unknown }).note;
      return typeof note === 'string' ? note.trim() : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

const BUNDLED_BY_VERSION: Record<string, string> = {
  '0.1.9': [
    'Quiet stretches no longer dump filler like “no no” into the dictation box, and the next real sentence still lands. Strike last sentence marks text in the box — strikethrough stays visible and is omitted on insert. The box is labeled Transcription.',
    '',
    '- Silence-filler loops are dropped without dropping the following sentence',
    '- Strike last sentence in the dictation box (strikethrough stays visible; omitted on manuscript insert)',
    '- Transcription label above the dictation box',
    '- Dictation drafts persist as struck and unstruck spans',
  ].join('\n'),
  '0.1.8': [
    'What’s New now shows after a real upgrade, including installs that never recorded a last-seen version. Queer lit is a first-class genre with a rainbow palette; YA is brighter, and romance has proper light-mode colors.',
    '',
    '- What’s New after real upgrades (not treated as a first install)',
    '- Queer lit genre and rainbow theme',
    '- Brighter YA palette and romance light-mode colors',
    '- Library, theme, and dictation place still persist on this device',
  ].join('\n'),
  '0.1.7': [
    'After you update, SpeakFiction now shows a short What’s New card so you can see what changed in this version.',
    '',
    '- Dismissible What’s New after in-app updates (not on first install)',
    '- Library, theme, and dictation place still persist on this device',
    '- Your license is unchanged',
  ].join('\n'),
  '0.1.6': [
    'Your books, theme, and dictation place now persist in SpeakFiction’s app data, so they come back after a quit or an update.',
    '',
    '- Library and manuscript stay on this device',
    '- Restart to install when a download is ready',
    '- Your license is unchanged',
  ].join('\n'),
};

export const DEFAULT_WHATS_NEW =
  'This version includes writing-flow and reliability improvements. Your library and license stay on this device.';

export function bundledWhatsNew(version: string): string {
  const v = String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('-b')[0];
  return (v && BUNDLED_BY_VERSION[v]) || DEFAULT_WHATS_NEW;
}

function stripUnsafe(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, '');
}

function inlineText(raw: string): string {
  return raw
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function parseReleaseNotes(raw: string): NotesBlock[] {
  const text = stripUnsafe(raw).replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const blocks: NotesBlock[] = [];
  let list: string[] | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    blocks.push({ type: 'paragraph', text: inlineText(para.join(' ')) });
    para = [];
  };
  const flushList = () => {
    if (!list?.length) return;
    blocks.push({ type: 'list', items: list });
    list = null;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, text: inlineText(heading[2]) });
      continue;
    }
    const item = /^[-*•]\s+(.+)$/.exec(trimmed) || /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (item) {
      flushPara();
      if (!list) list = [];
      list.push(inlineText(item[1]));
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return blocks;
}

export async function fetchGithubReleaseNotes(
  version: string,
  build: string | number = '',
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const urls = githubReleaseCandidateUrls(version, build);
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) continue;
      const data = (await res.json()) as { body?: unknown; tag_name?: unknown };
      const body = typeof data.body === 'string' ? data.body.trim() : '';
      if (!body) continue;
      if (url.endsWith('/releases/latest')) {
        const tag = typeof data.tag_name === 'string' ? data.tag_name : '';
        if (!releaseTagMatches(tag, version, build)) continue;
      }
      return body;
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveWhatsNewNotes(opts: {
  version: string;
  build: string | number;
  pending?: PendingWhatsNew | null;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; source: WhatsNewSource }> {
  const pendingNotes = opts.pending?.notes?.trim() ?? '';
  if (pendingNotes && notesMatchVersion(opts.pending?.version, opts.version)) {
    return { text: pendingNotes, source: 'pending' };
  }
  const fromGithub = await fetchGithubReleaseNotes(opts.version, opts.build, opts.fetchImpl ?? fetch);
  if (fromGithub) return { text: fromGithub, source: 'github' };
  return { text: bundledWhatsNew(opts.version), source: 'bundled' };
}
