import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  clearBlockFormatting,
  combineParagraphs,
  deleteHeadingRange,
  deleteParagraphs,
  emptyDocument,
  insertStructure,
  setBlockKind,
} from './document';
import {
  combineParagraphs as combineBlocks,
  deleteMovableRange,
  deleteParagraphs as deleteBlocks,
  dropPlaceLabel,
  emptyBlock,
  emptyTableRows,
  headingLabels,
  insertGapHoverLabel,
  insertGapSelectedLabel,
  paragraphRangeIds,
  setBlockKind as setKindBlocks,
} from './manuscript';
import { sequenceIds } from './uid';
import type { ManuscriptBlock } from './types';

function paras(): ManuscriptBlock[] {
  return [
    { ...emptyBlock('chapter', 'c1'), title: 'One' },
    { ...emptyBlock('paragraph', 'p1'), text: 'The wind howled.' },
    { ...emptyBlock('paragraph', 'p2'), text: 'Rain followed.', marks: [{ kind: 'italic', start: 0, end: 4 }] },
    { ...emptyBlock('scene', 's1'), title: 'Later' },
    { ...emptyBlock('paragraph', 'p3'), text: 'Aelith waited.' },
  ];
}

test('paragraph range follows manuscript order', () => {
  assert.deepEqual(paragraphRangeIds(['p1', 'p2', 'p3'], 'p1', 'p3'), ['p1', 'p2', 'p3']);
  assert.deepEqual(paragraphRangeIds(['p1', 'p2', 'p3'], 'p3', 'p1'), ['p1', 'p2', 'p3']);
  assert.deepEqual(paragraphRangeIds(['p1', 'p2', 'p3'], null, 'p2'), ['p2']);
});

test('combine joins selected paragraphs in document order and shifts marks', () => {
  const next = combineBlocks(paras(), ['p3', 'p1']);
  assert.deepEqual(next.map((block) => block.id), ['c1', 'p1', 'p2', 's1']);
  assert.equal(next[1]!.text, 'The wind howled. Aelith waited.');
  const marked = combineBlocks(paras(), ['p1', 'p2']);
  assert.equal(marked[1]!.text, 'The wind howled. Rain followed.');
  assert.deepEqual(marked[1]!.marks, [{ kind: 'italic', start: 17, end: 21 }]);
  assert.equal(combineBlocks(paras(), ['p2']).length, paras().length);
  assert.equal(combineBlocks(paras(), ['c1', 'p1']).length, paras().length);
});

test('delete paragraphs leaves headings', () => {
  const next = deleteBlocks(paras(), ['p3', 'p1', 'c1']);
  assert.deepEqual(next.map((block) => block.id), ['c1', 'p2', 's1']);
});

test('set block kind moves the words between a heading and a body paragraph', () => {
  const scene = setKindBlocks(paras(), 'p1', 'scene');
  assert.equal(scene[1]!.type, 'scene');
  assert.equal(scene[1]!.title, 'The wind howled.');
  assert.equal(scene[1]!.text, '');
  const body = setKindBlocks(paras(), 'c1', 'paragraph');
  assert.equal(body[0]!.type, 'paragraph');
  assert.equal(body[0]!.text, 'One');
});

test('delete movable range removes a chapter and the body under it', () => {
  const next = deleteMovableRange(paras(), 'c1');
  assert.deepEqual(next.map((block) => block.id), []);
  const sceneOnly = deleteMovableRange(paras(), 's1');
  assert.deepEqual(sceneOnly.map((block) => block.id), ['c1', 'p1', 'p2']);
});

test('table size clamps to 2×2 through 4×8', () => {
  assert.equal(emptyTableRows(1, 1).length, 2);
  assert.equal(emptyTableRows(1, 1)[0]!.length, 2);
  assert.equal(emptyTableRows(10, 20).length, 4);
  assert.equal(emptyTableRows(10, 20)[0]!.length, 8);
  assert.equal(emptyTableRows(3, 5).length, 3);
  assert.equal(emptyTableRows(3, 5)[0]!.length, 5);
});

test('drop and insertion labels name the landing spot', () => {
  assert.equal(dropPlaceLabel(emptyBlock('chapter', 'c')), 'Drop chapter here');
  assert.equal(dropPlaceLabel(emptyBlock('scene', 's')), 'Drop scene here');
  assert.equal(dropPlaceLabel(emptyBlock('section', 'n')), 'Drop section here');
  assert.equal(dropPlaceLabel(emptyBlock('paragraph', 'p')), 'Drop paragraph here');
  assert.equal(dropPlaceLabel(emptyBlock('image', 'i')), 'Drop image here');
  assert.equal(dropPlaceLabel(emptyBlock('table', 't')), 'Drop table here');
  assert.equal(insertGapHoverLabel(), 'Click to insert dictation here');
  assert.equal(insertGapSelectedLabel(), 'Dictation inserts here');
  assert.equal(headingLabels('scene').confirm, 'Delete this scene and all of its content?');
  assert.equal(headingLabels('chapter').unwrap, 'Remove chapter header');
});

test('document edits keep provenance with a kind change and a paragraph merge', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument('book'), 'paragraph', 0, ids());
  const first = doc.blocks[0]!.id;
  doc = {
    ...doc,
    blocks: doc.blocks.map((block) => (block.id === first ? { ...block, text: 'Alpha' } : block)),
    provenance: { ...doc.provenance, [first]: { title: [], text: [{ id: 's1', start: 0, end: 5, origin: 'other' }] } },
  };
  doc = insertStructure(doc, 'paragraph', 1, ids());
  const second = doc.blocks[1]!.id;
  doc = {
    ...doc,
    blocks: doc.blocks.map((block) => (block.id === second ? { ...block, text: 'Beta', marks: [{ kind: 'strike' as const, start: 0, end: 4 }] } : block)),
  };
  doc = await combineParagraphs({ doc, ids: [second, first], now: '2026-10-24T00:00:00.000Z', newId: ids });
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0]!.text, 'Alpha Beta');
  assert.deepEqual(doc.blocks[0]!.marks, [{ kind: 'strike', start: 6, end: 10 }]);
  assert.equal(doc.provenance[doc.blocks[0]!.id]?.text[0]?.start, 0);

  doc = setBlockKind(doc, doc.blocks[0]!.id, 'scene');
  assert.equal(doc.blocks[0]!.type, 'scene');
  assert.equal(doc.blocks[0]!.title, 'Alpha Beta');
  assert.equal(doc.provenance[doc.blocks[0]!.id]?.title[0]?.end, 10);
  assert.deepEqual(doc.provenance[doc.blocks[0]!.id]?.text, []);

  doc = clearBlockFormatting({
    ...doc,
    blocks: [{ ...emptyBlock('paragraph', 'p'), text: 'Struck', marks: [{ kind: 'bold', start: 0, end: 6 }] }],
  }, 'p', { start: 0, end: 0 });
  assert.deepEqual(doc.blocks[0]!.marks, []);

  const headed = insertStructure(insertStructure(emptyDocument('book'), 'chapter', 0, 'c'), 'paragraph', 1, 'p');
  const removed = deleteHeadingRange({
    ...headed,
    blocks: headed.blocks.map((block) => block.id === 'p' ? { ...block, text: 'Body' } : { ...block, title: 'Title' }),
  }, 'c');
  assert.equal(removed.blocks.length, 0);
  assert.equal(deleteParagraphs(headed, ['p']).blocks.map((block) => block.id).join(','), 'c');
});
