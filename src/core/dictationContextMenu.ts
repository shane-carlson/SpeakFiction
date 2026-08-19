/**
 * Dictation-box context menu: items and draft mutations.
 * Reuses the same spoken cues as the dictation console chips / audioCues.
 */

import {
  insertCueAt,
  promoteSelectionAsTitle,
  rangeIsStruck,
  setRangeStruck,
  strikeLastSentence,
  type DictationDraft,
  type TitleKind,
} from './dictationDraft';

/** Badge-row order on the dictation console (section before paragraph). */
export const DICTATION_COMMAND_CHIPS = [
  'new chapter',
  'new scene',
  'new section',
  'new paragraph',
  'period',
  'comma',
  'question mark',
  'open quote',
  'close quote',
] as const;

/** Caret-menu order: chapter, scene, paragraph, section. */
export const STRUCTURE_CUES = [
  { cue: 'new chapter', label: 'New chapter' },
  { cue: 'new scene', label: 'New scene' },
  { cue: 'new paragraph', label: 'New paragraph' },
  { cue: 'new section', label: 'New section' },
] as const;

export const PUNCTUATION_CUES = [
  { cue: 'period', label: 'Period' },
  { cue: 'comma', label: 'Comma' },
  { cue: 'question mark', label: 'Question mark' },
  { cue: 'open quote', label: 'Open quote' },
  { cue: 'close quote', label: 'Close quote' },
] as const;

export const TITLE_ACTIONS = [
  { kind: 'chapter' as const, label: 'Use as chapter title' },
  { kind: 'scene' as const, label: 'Use as scene title' },
  { kind: 'section' as const, label: 'Use as section title' },
];

export type DictationMenuGroup = 'structure' | 'insert' | 'strike' | 'title' | 'punctuation';

export type DictationMenuAction =
  | { type: 'insertCue'; cue: string }
  | { type: 'promoteTitle'; kind: TitleKind }
  | { type: 'strikeSelection' }
  | { type: 'unstrikeSelection' }
  | { type: 'strikeLastSentence' }
  | { type: 'insertDictation' };

export interface DictationMenuItem {
  id: string;
  label: string;
  group: DictationMenuGroup;
  action: DictationMenuAction;
  disabled?: boolean;
}

export interface DictationMenuOptions {
  hasSelection: boolean;
  selectionStruck?: boolean;
  canInsertDictation?: boolean;
}

export function buildDictationContextMenu(opts: DictationMenuOptions): DictationMenuItem[] {
  const canInsert = Boolean(opts.canInsertDictation);
  const insertItem: DictationMenuItem = {
    id: 'insert-dictation',
    label: 'Insert dictation',
    group: 'insert',
    action: { type: 'insertDictation' },
    disabled: !canInsert,
  };

  if (opts.hasSelection) {
    const strike: DictationMenuItem = opts.selectionStruck
      ? {
          id: 'unstrike-selection',
          label: 'Unstrike',
          group: 'strike',
          action: { type: 'unstrikeSelection' },
        }
      : {
          id: 'strike-selection',
          label: 'Strike through',
          group: 'strike',
          action: { type: 'strikeSelection' },
        };

    return [
      strike,
      ...TITLE_ACTIONS.map((t) => ({
        id: `title-${t.kind}`,
        label: t.label,
        group: 'title' as const,
        action: { type: 'promoteTitle' as const, kind: t.kind },
      })),
      ...STRUCTURE_CUES.map((s) => ({
        id: `cue-${s.cue.replace(/\s+/g, '-')}`,
        label: s.label,
        group: 'structure' as const,
        action: { type: 'insertCue' as const, cue: s.cue },
      })),
      insertItem,
    ];
  }

  return [
    ...STRUCTURE_CUES.map((s) => ({
      id: `cue-${s.cue.replace(/\s+/g, '-')}`,
      label: s.label,
      group: 'structure' as const,
      action: { type: 'insertCue' as const, cue: s.cue },
    })),
    insertItem,
    {
      id: 'strike-last-sentence',
      label: 'Strike last sentence',
      group: 'strike',
      action: { type: 'strikeLastSentence' },
    },
    ...PUNCTUATION_CUES.map((p) => ({
      id: `cue-${p.cue.replace(/\s+/g, '-')}`,
      label: p.label,
      group: 'punctuation' as const,
      action: { type: 'insertCue' as const, cue: p.cue },
    })),
  ];
}

export interface DraftRange {
  start: number;
  end: number;
}

/** Apply a draft-mutating menu action. Insert dictation is handled by the view. */
export function applyDictationMenuAction(
  draft: DictationDraft,
  action: DictationMenuAction,
  range: DraftRange,
): DictationDraft {
  switch (action.type) {
    case 'strikeSelection':
      return setRangeStruck(draft, range.start, range.end, true);
    case 'unstrikeSelection':
      return setRangeStruck(draft, range.start, range.end, false);
    case 'promoteTitle':
      return promoteSelectionAsTitle(draft, range.start, range.end, action.kind);
    case 'insertCue':
      return insertCueAt(draft, range.start, action.cue);
    case 'strikeLastSentence':
      return strikeLastSentence(draft);
    case 'insertDictation':
      // View copies unstruck text into the manuscript; the box is left as-is.
      return draft;
  }
}

export function menuSelectionStruck(draft: DictationDraft, range: DraftRange): boolean {
  return rangeIsStruck(draft, range.start, range.end);
}
