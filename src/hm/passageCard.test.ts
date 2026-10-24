import assert from 'node:assert/strict';
import { test } from 'vitest';
import { emptyDocument, insertStructure } from './document';
import { openPassageCards, passageCardId, scrollDelta } from './passageCard';

test('sealed spans link to their certification point', () => {
  assert.equal(
    passageCardId('block-1', { id: 'span-1', origin: 'keyboard', certificationId: 'point-9' }),
    'point-9',
  );
  assert.equal(
    passageCardId('block-1', { id: 'span-6', origin: 'dictation', certificationId: 'point-6' }),
    'point-6',
  );
});

test('unsealed spans link to a display card for that span', () => {
  assert.equal(passageCardId('block-1', { id: 'span-2', origin: 'paste' }), 'span:block-1:span-2');
  assert.equal(passageCardId('block-1', { id: 'span-3', origin: 'drop' }), 'span:block-1:span-3');
  assert.equal(passageCardId('block-1', { id: 'span-4', origin: 'other' }), 'span:block-1:span-4');
  assert.equal(
    passageCardId('block-1', { id: 'span-5', origin: 'keyboard' }),
    'span:block-1:span-5',
  );
  assert.equal(passageCardId('block-1', { id: '', origin: 'other' }), 'span:block-1:bare');
});

test('open passage cards skip sealed text and blank spans', () => {
  const doc = emptyDocument('ms');
  doc.blocks = [
    {
      id: 'p1',
      type: 'paragraph',
      title: '',
      text: 'Typed paste more',
      marks: [],
    },
    {
      id: 'c1',
      type: 'chapter',
      title: 'Dropped title',
      text: '',
      marks: [],
    },
  ];
  doc.provenance = {
    p1: {
      title: [],
      text: [
        { id: 's1', start: 0, end: 5, origin: 'keyboard', certificationId: 'pt-1' },
        { id: 's2', start: 5, end: 11, origin: 'paste' },
        { id: 's3', start: 11, end: 12, origin: 'other' },
        { id: 's4', start: 12, end: 16, origin: 'drop' },
      ],
    },
    c1: {
      title: [{ id: 's5', start: 0, end: 13, origin: 'drop' }],
      text: [],
    },
  };
  const cards = openPassageCards(doc);
  assert.deepEqual(
    cards.map((card) => card.id),
    ['span:p1:s2', 'span:p1:s4', 'span:c1:s5'],
  );
  assert.equal(cards[0]?.text, ' paste');
  assert.equal(cards[2]?.text, 'Dropped title');
});

test('open cards include seed prose with no provenance so hover has somewhere to land', () => {
  let doc = insertStructure(emptyDocument('ms'), 'paragraph', 0, 'p1');
  doc = {
    ...doc,
    blocks: doc.blocks.map((block) => (block.id === 'p1' ? { ...block, text: 'The wind howled.' } : block)),
  };
  const cards = openPassageCards(doc);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, 'span:p1:bare');
  assert.equal(cards[0]?.origin, 'other');
  assert.equal(cards[0]?.text, 'The wind howled.');
});

test('open cards skip sealed spans and still emit uncovered seed text', () => {
  let doc = insertStructure(emptyDocument('ms'), 'paragraph', 0, 'p1');
  doc = {
    ...doc,
    blocks: doc.blocks.map((block) => (block.id === 'p1' ? { ...block, text: 'Sealed gap.' } : block)),
    provenance: {
      p1: {
        title: [],
        text: [{ id: 's1', start: 0, end: 6, origin: 'keyboard', certificationId: 'pt1' }],
      },
    },
  };
  const cards = openPassageCards(doc);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, 'span:p1:bare');
  assert.match(cards[0]?.text ?? '', /gap/);
});

test('scroll delta moves only cards outside the pane', () => {
  assert.equal(scrollDelta(0, 200, 20, 80), 0);
  assert.equal(scrollDelta(0, 200, -40, 20), -50);
  assert.equal(scrollDelta(0, 200, 180, 260), 70);
  assert.equal(scrollDelta(0, 100, 40, 240), 30);
  assert.equal(scrollDelta(0, 0, 10, 20), 0);
});
