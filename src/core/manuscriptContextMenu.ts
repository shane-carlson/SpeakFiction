import {
  withSpellcheckItems,
  type SpellcheckHit,
  type SpellcheckMenuItem,
} from './spellcheckMenu';

export const CHAPTER_UNWRAP_ID = 'unwrap-header';
export const CHAPTER_DELETE_ID = 'delete-chapter';
export const CHAPTER_UNWRAP_LABEL = 'Remove chapter header';
export const CHAPTER_DELETE_LABEL = 'Delete chapter';
export const UNSELECT_INSERT_ID = 'unselect-insert';
export const UNSELECT_INSERT_LABEL = 'Unselect insertion point';

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

/** Heading-only unwrap vs heading+body delete. Shown on chapter X hover and right-click. */
export function chapterHeadingMenuItems(): SpellcheckMenuItem[] {
  return [
    { id: CHAPTER_UNWRAP_ID, label: CHAPTER_UNWRAP_LABEL, group: 'chapter' },
    { id: CHAPTER_DELETE_ID, label: CHAPTER_DELETE_LABEL, group: 'chapter' },
  ];
}

export function buildManuscriptContextMenu(
  canInsertDictation: boolean,
  spell?: SpellcheckHit | null,
  opts?: { chapterHeading?: boolean; canUnselectInsert?: boolean },
): SpellcheckMenuItem[] {
  const insert = manuscriptInsertMenuItems(canInsertDictation, {
    canUnselectInsert: opts?.canUnselectInsert,
  });
  const items = opts?.chapterHeading ? [...chapterHeadingMenuItems(), ...insert] : insert;
  return withSpellcheckItems(items, spell);
}

export function applyChapterHeadingMenuAction(
  id: string,
  actions: { unwrapHeading: () => void; deleteChapter: () => void },
): boolean {
  if (id === CHAPTER_UNWRAP_ID) {
    actions.unwrapHeading();
    return true;
  }
  if (id === CHAPTER_DELETE_ID) {
    actions.deleteChapter();
    return true;
  }
  return false;
}
