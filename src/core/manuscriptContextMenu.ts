import {
  withSpellcheckItems,
  type SpellcheckHit,
  type SpellcheckMenuItem,
} from './spellcheckMenu';

export function manuscriptInsertMenuItems(canInsertDictation: boolean): SpellcheckMenuItem[] {
  return [
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

export function buildManuscriptContextMenu(
  canInsertDictation: boolean,
  spell?: SpellcheckHit | null,
): SpellcheckMenuItem[] {
  return withSpellcheckItems(manuscriptInsertMenuItems(canInsertDictation), spell);
}
