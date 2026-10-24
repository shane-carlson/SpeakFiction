import assert from 'node:assert/strict';
import { test } from 'vitest';
import { contentHash, countOriginWords } from './certification';
import {
  editField,
  emptyDocument,
  insertStructure,
  replaceAllManuscriptMatches,
  replaceManuscriptMatch,
} from './document';
import { findMatches, matchIndexAtOrAfter } from './manuscript';
import { sequenceIds } from './uid';

const now = '2026-10-16T12:00:00.000Z';

function keyEvent(data: string) {
  return { at: now, inputType: 'insertText', data, trusted: true };
}

async function typeField(
  doc: ReturnType<typeof emptyDocument>,
  blockId: string,
  field: 'title' | 'text',
  text: string,
  ids: () => string,
) {
  return editField({
    doc,
    blockId,
    field,
    start: 0,
    end: 0,
    insert: text,
    origin: 'keyboard',
    event: keyEvent(text),
    now,
    newId: ids,
  });
}

test('replace one splits the seal and leaves the replacement uncertified', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'chapter', 0, ids());
  const chapterId = doc.blocks[0]!.id;
  doc = await typeField(doc, chapterId, 'title', 'Night watch', ids);
  doc = insertStructure(doc, 'paragraph', 1, ids());
  const firstId = doc.blocks[1]!.id;
  doc = await typeField(doc, firstId, 'text', 'The lantern lit the lantern.', ids);
  doc = insertStructure(doc, 'paragraph', 2, ids());
  const secondId = doc.blocks[2]!.id;
  doc = await typeField(doc, secondId, 'text', 'The road stayed dark.', ids);

  const matches = findMatches(doc.blocks, 'lantern');
  assert.equal(matches.length, 2);
  const original = doc.points.find((point) => point.blockId === firstId)!;
  const untouched = structuredClone(doc.provenance[secondId]);
  const before = structuredClone(doc);
  findMatches(doc.blocks, 'lantern');
  assert.equal(matchIndexAtOrAfter(doc.blocks, matches, { blockId: firstId, field: 'text', at: 0 }), 0);
  assert.deepEqual(doc, before);

  const next = await replaceManuscriptMatch({
    doc,
    match: matches[0]!,
    replacement: 'candle',
    now,
    newId: ids,
  });

  assert.equal(next.blocks[1]!.text, 'The candle lit the lantern.');
  assert.equal(next.blocks[2]!.text, 'The road stayed dark.');
  assert.deepEqual(next.provenance[secondId], untouched);

  const spans = next.provenance[firstId]!.text;
  assert.deepEqual(
    spans.map((span) => span.origin),
    ['keyboard', 'other', 'keyboard'],
  );
  assert.equal(next.blocks[1]!.text.slice(spans[1]!.start, spans[1]!.end), 'candle');
  assert.equal(spans[1]!.certificationId, undefined);
  assert.equal(spans[0]!.certificationId, original.id);
  assert.notEqual(spans[2]!.certificationId, original.id);
  assert.ok(spans[0]!.certificationId);
  assert.ok(spans[2]!.certificationId);
  const remnant = next.points.find((point) => point.id === spans[2]!.certificationId);
  assert.equal(remnant?.text, ' lit the lantern.');
  assert.match(remnant?.lineage ?? '', new RegExp(original.id));
  for (const point of next.points) {
    assert.equal(point.origin, 'keyboard');
    assert.equal(point.text.includes('candle'), false);
    assert.equal(point.contentHash, await contentHash(point.text));
  }
  const words = countOriginWords(next.blocks[1]!.text, spans);
  assert.equal(words.certified, 4);
  assert.equal(words.uncertified, 1);

  const rest = findMatches(next.blocks, 'lantern');
  assert.equal(rest.length, 1);
  assert.equal(
    matchIndexAtOrAfter(next.blocks, rest, {
      blockId: firstId,
      field: 'text',
      at: matches[0]!.start + 'candle'.length,
    }),
    0,
  );
  assert.ok(rest[0]!.start >= spans[2]!.start && rest[0]!.end <= spans[2]!.end);
});

test('replacing a match with the same letters still drops the keyboard seal', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const blockId = doc.blocks[0]!.id;
  doc = await typeField(doc, blockId, 'text', 'The lantern lit the lantern.', ids);
  const match = findMatches(doc.blocks, 'Lantern')[0]!;
  const next = await replaceManuscriptMatch({
    doc,
    match,
    replacement: 'lantern',
    now,
    newId: ids,
  });
  assert.equal(next.blocks[0]!.text, 'The lantern lit the lantern.');
  const spans = next.provenance[blockId]!.text;
  const replaced = spans.find((span) => next.blocks[0]!.text.slice(span.start, span.end) === 'lantern' && span.start === match.start);
  assert.equal(replaced?.origin, 'other');
  assert.equal(replaced?.certificationId, undefined);
  assert.equal(spans.some((span) => span.origin === 'keyboard' && span.certificationId), true);
  assert.equal(next.points.some((point) => point.text === 'lantern'), false);
});

test('replace all updates every match in the chapter and leaves replacements uncertified', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'chapter', 0, ids());
  const chapterId = doc.blocks[0]!.id;
  doc = await typeField(doc, chapterId, 'title', 'The lantern road', ids);
  doc = insertStructure(doc, 'paragraph', 1, ids());
  const firstId = doc.blocks[1]!.id;
  doc = await typeField(doc, firstId, 'text', 'A lantern glowed.', ids);
  doc = insertStructure(doc, 'paragraph', 2, ids());
  const secondId = doc.blocks[2]!.id;
  doc = await typeField(doc, secondId, 'text', 'Then the lantern dimmed.', ids);
  doc = insertStructure(doc, 'chapter', 3, ids());
  doc = insertStructure(doc, 'paragraph', 4, ids());
  const otherId = doc.blocks[4]!.id;
  doc = await typeField(doc, otherId, 'text', 'One more lantern.', ids);
  doc = insertStructure(doc, 'paragraph', 5, ids());
  const quietId = doc.blocks[5]!.id;
  doc = await typeField(doc, quietId, 'text', 'The road stayed dark.', ids);
  const quietPoints = doc.points.filter((point) => point.blockId === quietId).map((point) => point.id);

  const found = findMatches(doc.blocks, 'lantern');
  assert.equal(found.length, 4);

  const { doc: replaced, count } = await replaceAllManuscriptMatches({
    doc,
    query: 'LANTERN',
    replacement: 'candle',
    now,
    newId: ids,
  });
  assert.equal(count, 4);
  assert.equal(replaced.blocks[0]!.title, 'The candle road');
  assert.equal(replaced.blocks[1]!.text, 'A candle glowed.');
  assert.equal(replaced.blocks[2]!.text, 'Then the candle dimmed.');
  assert.equal(replaced.blocks[4]!.text, 'One more candle.');
  assert.equal(replaced.blocks[5]!.text, 'The road stayed dark.');
  assert.deepEqual(
    replaced.points.filter((point) => point.blockId === quietId).map((point) => point.id),
    quietPoints,
  );

  const passages: Array<['title' | 'text', string, string]> = [
    ['title', chapterId, replaced.blocks[0]!.title],
    ['text', firstId, replaced.blocks[1]!.text],
    ['text', secondId, replaced.blocks[2]!.text],
    ['text', otherId, replaced.blocks[4]!.text],
  ];
  for (const [field, blockId, text] of passages) {
    const spans = replaced.provenance[blockId]![field];
    const candle = spans.find((span) => text.slice(span.start, span.end) === 'candle');
    assert.ok(candle, text);
    assert.equal(candle.origin, 'other');
    assert.equal(candle.certificationId, undefined);
    for (const span of spans) {
      if (text.slice(span.start, span.end).includes('candle')) {
        assert.equal(span.origin, 'other');
        assert.equal(span.certificationId, undefined);
      } else if (span.origin === 'keyboard') {
        assert.ok(span.certificationId);
      }
    }
  }
  assert.equal(replaced.points.some((point) => point.text.toLowerCase().includes('candle')), false);
  assert.equal(findMatches(replaced.blocks, 'lantern').length, 0);
  assert.equal(findMatches(replaced.blocks, 'candle').length, 4);
});

test('replace all applies from the end so earlier matches keep their offsets', async () => {
  const ids = sequenceIds('id');
  let doc = insertStructure(emptyDocument(ids()), 'paragraph', 0, ids());
  const blockId = doc.blocks[0]!.id;
  doc = await typeField(doc, blockId, 'text', 'aa aa', ids);
  const { doc: replaced, count } = await replaceAllManuscriptMatches({
    doc,
    query: 'aa',
    replacement: 'bbb',
    now,
    newId: ids,
  });
  assert.equal(count, 2);
  assert.equal(replaced.blocks[0]!.text, 'bbb bbb');
  const spans = replaced.provenance[blockId]!.text;
  assert.deepEqual(
    spans.map((span) => [span.origin, replaced.blocks[0]!.text.slice(span.start, span.end)]),
    [
      ['other', 'bbb'],
      ['keyboard', ' '],
      ['other', 'bbb'],
    ],
  );
  assert.equal(spans[0]!.certificationId, undefined);
  assert.equal(spans[2]!.certificationId, undefined);
  assert.ok(spans[1]!.certificationId);
  assert.equal(replaced.points.some((point) => point.text.includes('bbb')), false);
});
