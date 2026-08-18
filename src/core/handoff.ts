import { toPlainText, toRtf, type ExportContext } from './export';
import { manuscriptStats } from './manuscript';
import type { Manuscript } from './types';

export type HandoffAppId = 'scrivener' | 'word';

/** Plain prose for the clipboard — no Scrivener Import-and-Split `#` markers. */
export function toLiveInsertText(manuscript: Manuscript, ctx: ExportContext): string {
  return toPlainText(manuscript, ctx);
}

/** RTF for Word/Scrivener paste. Chapter titles are headings, not split delimiters. */
export function toLiveInsertRtf(manuscript: Manuscript, ctx: ExportContext): string {
  return toRtf(manuscript, ctx, { chapterSplit: false });
}

export function liveInsertIsEmpty(manuscript: Manuscript): boolean {
  const stats = manuscriptStats(manuscript);
  return stats.words === 0 && stats.chapters === 0 && stats.scenes === 0;
}
