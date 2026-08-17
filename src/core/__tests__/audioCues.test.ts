import { describe, expect, it } from 'vitest';
import { parseAudioCues } from '../audioCues';

describe('parseAudioCues', () => {
  it('splits text on a chapter cue', () => {
    const segs = parseAudioCues('the end of the beginning new chapter the dawn came slowly');
    expect(segs[0]).toEqual({ type: 'text', text: 'the end of the beginning' });
    expect(segs[1]).toEqual({ type: 'structure', event: { kind: 'chapter' } });
    expect(segs[2]).toEqual({ type: 'text', text: 'the dawn came slowly' });
  });

  it('captures a spoken chapter title terminated by punctuation', () => {
    const segs = parseAudioCues('new chapter titled The Awakening. the room was cold');
    expect(segs[0]).toEqual({ type: 'structure', event: { kind: 'chapter', title: 'The Awakening' } });
    expect(segs[1]).toEqual({ type: 'text', text: 'the room was cold' });
  });

  it('handles scene and section breaks', () => {
    const segs = parseAudioCues('a scene break b section break c');
    expect(segs.map((s) => (s.type === 'structure' ? s.event.kind : s.text))).toEqual([
      'a',
      'scene',
      'b',
      'section',
      'c',
    ]);
  });

  it('treats new paragraph as a paragraph structure event', () => {
    const segs = parseAudioCues('first line new paragraph second line');
    expect(segs[1]).toEqual({ type: 'structure', event: { kind: 'paragraph' } });
  });

  it('returns a single text segment when there are no cues', () => {
    const segs = parseAudioCues('just some ordinary prose');
    expect(segs).toEqual([{ type: 'text', text: 'just some ordinary prose' }]);
  });
});
