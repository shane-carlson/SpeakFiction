/**
 * In-app What’s New is a short list of feature-benefit bullets only.
 * Pack, signing, installers, hardware, and updater internals stay on GitHub
 * Releases — never in this dialog. Prefer BUNDLED_BY_VERSION over raw notes.
 */
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

const MAX_WHATS_NEW_BULLETS = 6;

/** Headings whose sections are packaging/ops, not user-facing features. */
const OPS_HEADING_RE =
  /^(pack(?:aging)?|mac(?:os)?|windows|win(?:32)?|linux|site|installers?|signing|notarization|hardware|auto-?update|distribution|ci|ops)\b/i;

/** Lines that are installer, signing, hardware, or artifact copy. */
const OPS_COPY_RE =
  /\b(notariz|stapler|codesign|hardened runtime|electron-builder|nsis|\.dmg|\.yml|latest\.yml|blockmap|apple silicon|intel mac|whisper-(?:cli|small|medium|large)|ggml-|pack:mac|pack:win|build number|buildNumber|github release artifacts?)\b/i;

function bullets(...items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

export function marketingVersion(version: string | null | undefined): string {
  return String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('-b')[0];
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
  const pending = marketingVersion(pendingVersion);
  const current = marketingVersion(currentVersion);
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
  '0.2.20': bullets(
    'The Accessibility dialog appears only when you click Enable, not on a loop',
    'Background live-send checks stay silent after you grant access',
    'If the toggle is already on, Restart SpeakFiction still applies it',
  ),
  '0.2.19': bullets(
    'Live send checks Accessibility with the live macOS prompt, not a stale silent flag',
    'Send still works if the badge has not caught up yet; a successful paste clears it',
    'If macOS has the toggle on but SpeakFiction still says needed, Restart SpeakFiction applies it',
    'Development builds ask you to enable Electron in Accessibility, not SpeakFiction',
  ),
  '0.2.18': bullets(
    'If you deleted the example book, Library can add Example: The Ember King back',
    'The restored sample includes the chapter outline, scenes, and trained names',
    'The offer only appears when that example is not already in your library',
    'Live send notices Accessibility as soon as it is on, without a restart',
  ),
  '0.2.17': bullets(
    'LibreOffice Writer is on Integrations: export the same styled .docx Word uses',
    'Open it in Writer and jump chapters in Navigator, then Save As .odt when you want the native file',
    'On a Mac, live paste into LibreOffice at the cursor, the same way as Word',
    'On-Device Model’s intro uses the full page width, so the privacy copy is easier to read',
  ),
  '0.2.16': bullets(
    'On-Device Model says the private adaptation is trained on this device, and no prose leaves your device',
    'The ethics note is shorter: models built from open source and creative commons works',
    'Your personal adaptation layer is still yours alone',
  ),
  '0.2.15': bullets(
    'Dictation cues are shorter and grouped: say, name, keys, and insert',
    'Hide the cue list when you know it, or show it again from Cues',
    'Choose insertion point, then click a gap to mark where dictation lands',
    'Right-click the marker to unselect it — with none chosen, insert goes at the end',
  ),
  '0.2.14': bullets(
    'Check for Updates lives in the SpeakFiction menu, next to About',
    'If you are already current, SpeakFiction says so instead of staying quiet',
    'A downloaded update still offers Restart to install in the sidebar',
  ),
  '0.2.13': bullets(
    'Click a space between chapters, scenes, or paragraphs to mark where dictation lands',
    'A Dictation inserts here marker stays on that spot — the same places you can drop a dragged block',
    'With no point chosen, insert goes at the end of the manuscript',
  ),
  '0.2.12': bullets(
    'Say “New Character” then the name twice to train it — the cue never lands in the transcription box or the manuscript',
    'The two repeats teach pronunciation, so later mishearings rewrite to the canonical spelling',
    'Name libraries are shared across a series, labeled with the book where each name was first trained',
  ),
  '0.2.11': bullets(
    'Grab the dotted handle on a chapter, scene, or paragraph to move it. Legal landing spots light up as you drag',
    'A Drop here marker follows the pointer, so you are not hunting for a tiny gap',
    'The manuscript scrolls when you drag near the edge, so a chapter can travel the whole book',
  ),
  '0.2.10': bullets(
    'The window comes back where you left it — size, place, zoom, and maximized — even after an update, and it stays on a visible screen',
    'Dictation and manuscript splitters, the last tab you were on, and full-screen editor stay where you set them',
    'Hover the X on a chapter heading for Remove chapter header vs Delete chapter — the same choices as a right-click',
  ),
  '0.2.9': bullets(
    'Right-click a chapter heading to drop just the header and keep the body, or delete the whole chapter after you confirm',
    'Say “undo last command” (or last voice, audio, or verbal command) to take back the last spoken cue',
    'Insert a picture from the icon next to Bold, Italic, Underline, and Strikethrough',
    'Insert a table from the toolbar — pick 2×2 through 4×8 — and export it with the manuscript',
  ),
  '0.2.8': bullets(
    'Right-click a misspelled word in the manuscript for suggestions and Add to dictionary at the top of the menu',
    'Dictate from the full-screen editor with a compact strip: mic, transcript, Strike, and Insert — same as the main screen',
    'Number books in a series so the library lists Book 1, Book 2, and so on',
  ),
  '0.2.7': bullets(
    'Full-screen manuscript: tools on the left, a wide page on the right, drag the bar between them to resize',
    'Dictation, the transcription box, and insert-into-manuscript fit on the main screen without scrolling',
    'Word, chapter, and scene counts sit smaller and higher so the writing panes get more room',
  ),
  '0.2.6': bullets(
    'Full-screen manuscript editor — Escape to return to dictation',
    'Toolbar for new chapter, scene, section, and paragraph, plus headings and undo/redo',
    'Bold, italic, underline, strikethrough, and clear formatting in the manuscript',
    'Insert pictures as manuscript blocks; they stay on this computer',
    'Export with pictures to Word, Scrivener, and Google Docs',
  ),
  '0.2.5': bullets(
    'Drag to reorder chapters, scenes, and paragraphs in the manuscript',
    'Chapter numbers update to match order; titles stay editable in the manuscript',
    'Insert a new scene or paragraph from the manuscript',
  ),
  '0.2.4': bullets(
    'Insert dictation lands in the transcription box at the caret, not the manuscript',
    'Spoken lines stay in the box until you insert them into the manuscript',
    'Insert into manuscript promotes unstruck text and clears the box for the next take',
    'Struck lines stay visible in the box and stay out of the manuscript',
  ),
  '0.2.3': bullets('Windows app icon and taskbar show the SpeakFiction logo'),
  '0.2.2': bullets(
    'Insert dictation at the cursor without wiping the transcription box',
    'Struck and unstruck text stay in the box so you can insert again or keep editing',
    'Native Mac title bar with traffic lights, drag-to-move, and double-click zoom',
  ),
  '0.2.1': bullets(
    'Right-click the transcription box to strike text or turn a selection into a chapter, scene, or section title',
    'Insert dictation between manuscript blocks so new lines land where you want them',
    'Structure cues sit at the top of the caret menu so new chapter, scene, and paragraph are one click away',
  ),
  '0.2.0': bullets(
    'Dictation hears more of what you say, including quiet lines',
    'Spoken cues (new chapter, new scene, new paragraph) reach the box again',
    'What’s New is a short list of features, not installer notes',
  ),
  '0.1.9': bullets(
    'Strike last sentence in the dictation box — keep the line visible, leave it out of the manuscript',
    'Less silence junk (“no, no”) without eating the next sentence',
    'Struck drafts stay in the box so you can still see what you dropped',
    'The box is labeled Transcription so it is clear what you are editing',
  ),
  '0.1.8': bullets(
    'What’s New after real upgrades — not treated as a first install',
    'Queer lit genre and brighter YA/romance palettes',
    'Library, theme, and dictation place still persist on this device',
  ),
  '0.1.7': bullets(
    'What’s New after a real upgrade, not on first install',
    'Library, theme, and dictation place still persist on this device',
    'Your license is unchanged',
  ),
  '0.1.6': bullets(
    'Library and manuscript stay on this device after a quit or update',
    'Theme and dictation place come back where you left them',
    'Your license is unchanged',
  ),
};

export const DEFAULT_WHATS_NEW = bullets(
  'Writing-flow and reliability improvements',
  'Library, theme, and dictation place stay on this device',
  'Your license is unchanged',
);

export function hasCuratedWhatsNew(version: string): boolean {
  const v = marketingVersion(version);
  return Boolean(v && BUNDLED_BY_VERSION[v]);
}

export function bundledWhatsNew(version: string): string {
  const v = marketingVersion(version);
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

function isOpsHeading(text: string): boolean {
  return OPS_HEADING_RE.test(text.trim());
}

function isOpsCopy(text: string): boolean {
  return OPS_COPY_RE.test(text);
}

/** Drop pack/ops headings and copy; keep a short feature-benefit list. */
export function sanitizeWhatsNewNotes(raw: string): string {
  const blocks = parseReleaseNotes(raw);
  const items: string[] = [];
  let skipSection = false;

  for (const block of blocks) {
    if (block.type === 'heading') {
      skipSection = isOpsHeading(block.text);
      continue;
    }
    if (skipSection) continue;
    if (block.type !== 'list') continue;
    for (const item of block.items) {
      const text = item.trim();
      if (text && !isOpsCopy(text)) items.push(text);
    }
  }

  const unique = [...new Set(items)].slice(0, MAX_WHATS_NEW_BULLETS);
  return unique.length ? bullets(...unique) : '';
}

/** List items for the dialog — headings and paragraphs are ignored. */
export function featureBullets(notes: string): string[] {
  const items: string[] = [];
  for (const block of parseReleaseNotes(notes)) {
    if (block.type === 'list') items.push(...block.items.map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(items)].slice(0, MAX_WHATS_NEW_BULLETS);
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
  if (hasCuratedWhatsNew(opts.version)) {
    return { text: bundledWhatsNew(opts.version), source: 'bundled' };
  }

  const pendingNotes = opts.pending?.notes?.trim() ?? '';
  if (pendingNotes && notesMatchVersion(opts.pending?.version, opts.version)) {
    const sanitized = sanitizeWhatsNewNotes(pendingNotes);
    if (sanitized) return { text: sanitized, source: 'pending' };
  }

  const fromGithub = await fetchGithubReleaseNotes(opts.version, opts.build, opts.fetchImpl ?? fetch);
  if (fromGithub) {
    const sanitized = sanitizeWhatsNewNotes(fromGithub);
    if (sanitized) return { text: sanitized, source: 'github' };
  }

  return { text: DEFAULT_WHATS_NEW, source: 'bundled' };
}
