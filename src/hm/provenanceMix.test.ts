import assert from 'node:assert/strict';
import { test } from 'vitest';
import { formatMixLabel, mixPercentages, provenanceMix } from './provenanceMix';

test('mix percentages by character', () => {
  const mix = provenanceMix('abcdef', [
    { id: 'a', start: 0, end: 3, origin: 'keyboard', certificationId: 'p1' },
    { id: 'b', start: 3, end: 6, origin: 'paste' },
  ]);
  assert.equal(mix.sealedChars, 3);
  assert.equal(mix.pasteChars, 3);
  const p = mixPercentages(mix);
  assert.equal(p.sealed, 50);
  assert.equal(p.paste, 50);
  assert.equal(formatMixLabel(mix), '50% sealed · 50% pasted');
});

test('dictation is its own share, not keyboard and not other', () => {
  const mix = provenanceMix('abcdef', [
    { id: 'a', start: 0, end: 2, origin: 'keyboard', certificationId: 'p1' },
    { id: 'b', start: 2, end: 4, origin: 'dictation', certificationId: 'p2' },
    { id: 'c', start: 4, end: 6, origin: 'paste' },
  ]);
  assert.equal(mix.sealedChars, 2);
  assert.equal(mix.dictationChars, 2);
  assert.equal(mix.pasteChars, 2);
  assert.equal(mix.otherChars, 0);
  assert.equal(formatMixLabel(mix), '33% sealed · 33% dictated · 33% pasted');
});
