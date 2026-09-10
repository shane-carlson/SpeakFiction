import {
  withSpellcheckItems,
  type SpellcheckHit,
  type SpellcheckMenuItem,
} from './spellcheckMenu';

export type ManuscriptHeadingKind = 'chapter' | 'scene' | 'section';

export const CHAPTER_UNWRAP_ID = 'unwrap-header';
export const CHAPTER_DELETE_ID = 'delete-chapter';
export const CHAPTER_UNWRAP_LABEL = 'Remove chapter header';
export const CHAPTER_DELETE_LABEL = 'Delete chapter';
export const UNSELECT_INSERT_ID = 'unselect-insert';
export const UNSELECT_INSERT_LABEL = 'Unselect insertion point';

const HEADING_KINDS = new Set<ManuscriptHeadingKind>(['chapter', 'scene', 'section']);

export function isManuscriptHeadingKind(value: string | undefined): value is ManuscriptHeadingKind {
  return HEADING_KINDS.has(value as ManuscriptHeadingKind);
}

export function headingLabels(kind: ManuscriptHeadingKind): {
  unwrap: string;
  delete: string;
  aria: string;
  confirm: string;
} {
  return {
    unwrap: `Remove ${kind} header`,
    delete: `Delete ${kind}`,
    aria: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} remove options`,
    confirm: `Delete this ${kind} and all of its content?`,
  };
}

export function manuscriptInsertMenuItems(
  canInsertDictation: boolean,
  opts?: { canUnselectInsert?: boolean },
): SpellcheckMenuItem[] {
  return [
    ...(opts?.canUnselectInsert
      ? [{ id: UNSELECT_INSERT_ID, label: UNSELECT_INSERT_LABEL, group: 'insert' as const }]
      : []),
    {
      id: 'insert-dictation-here',
      label: 'Insert dictation here',
      group: 'insert',
      disabled: !canInsertDictation,
    },
    { id: 'insert-chapter', label: 'Insert new chapter', group: 'structure' },
    { id: 'insert-scene', label: 'Insert new scene', group: 'structure' },
    { id: 'insert-section', label: 'Insert new section', group: 'structure' },
    { id: 'insert-paragraph', label: 'Insert new paragraph', group: 'structure' },
    { id: 'insert-image', label: 'Insert image', group: 'media' },
  ];
}

/** Heading-only unwrap vs heading+body delete. Shown on X hover and right-click. */
export function headingMenuItems(kind: ManuscriptHeadingKind): SpellcheckMenuItem[] {
  const labels = headingLabels(kind);
  return [
    { id: CHAPTER_UNWRAP_ID, label: labels.unwrap, group: 'heading' },
    { id: CHAPTER_DELETE_ID, label: labels.delete, group: 'heading' },
  ];
}

/** @deprecated Use headingMenuItems('chapter') */
export function chapterHeadingMenuItems(): SpellcheckMenuItem[] {
  return headingMenuItems('chapter');
}

export function buildManuscriptContextMenu(
  canInsertDictation: boolean,
  spell?: SpellcheckHit | null,
  opts?: { headingKind?: ManuscriptHeadingKind; chapterHeading?: boolean; canUnselectInsert?: boolean },
): SpellcheckMenuItem[] {
  const insert = manuscriptInsertMenuItems(canInsertDictation, {
    canUnselectInsert: opts?.canUnselectInsert,
  });
  const kind = opts?.headingKind ?? (opts?.chapterHeading ? 'chapter' : undefined);
  const items = kind ? [...headingMenuItems(kind), ...insert] : insert;
  return withSpellcheckItems(items, spell);
}

export function applyHeadingMenuAction(
  id: string,
  actions: { unwrapHeading: () => void; deleteHeading: () => void },
): boolean {
  if (id === CHAPTER_UNWRAP_ID) {
    actions.unwrapHeading();
    return true;
  }
  if (id === CHAPTER_DELETE_ID) {
    actions.deleteHeading();
    return true;
  }
  return false;
}

/** @deprecated Use applyHeadingMenuAction */
export function applyChapterHeadingMenuAction(
  id: string,
  actions: { unwrapHeading: () => void; deleteChapter: () => void },
): boolean {
  return applyHeadingMenuAction(id, {
    unwrapHeading: actions.unwrapHeading,
    deleteHeading: actions.deleteChapter,
  });
}
