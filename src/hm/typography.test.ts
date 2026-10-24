import assert from 'node:assert/strict';
import { test } from 'vitest';
import { emptyDocument, insertStructure } from './document';
import {
  resolveManuscriptTypography,
  setManuscriptTypography,
} from './typography';
import { sequenceIds } from './uid';

test('a font change keeps certification and is not an insertion', () => {
  const ids = sequenceIds('id');
  const doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const next = setManuscriptTypography(doc, { fontFamily: 'courier', fontSize: 18 });
  assert.equal(next.fontFamily, 'courier');
  assert.equal(next.fontSize, 18);
  assert.equal(next.points, doc.points);
  assert.equal(next.provenance, doc.provenance);
  assert.equal(next.blocks, doc.blocks);
  assert.equal(next.moves, doc.moves);
  assert.equal(next.blocks[0]!.text, doc.blocks[0]!.text);
});

test('unknown face and size fall back to Palatino at 12pt', () => {
  const doc = emptyDocument('ms');
  const unset = resolveManuscriptTypography(doc);
  assert.equal(unset.font.id, 'palatino');
  assert.equal(unset.font.exportName, 'Palatino');
  assert.equal(unset.sizePt, 12);
  const junk = resolveManuscriptTypography({ fontFamily: 'comic-sans', fontSize: 99 });
  assert.equal(junk.font.id, 'palatino');
  assert.equal(junk.sizePt, 12);
  assert.equal(setManuscriptTypography(doc, { fontFamily: 'nope', fontSize: 7 }), doc);
});
