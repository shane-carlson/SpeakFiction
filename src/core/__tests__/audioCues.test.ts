import { describe, expect, it } from 'vitest';
import { parseAudioCues } from '../audioCues';

describe('parseAudioCues', () => {
  it('splits text on a chapter cue and uses the following sentence as the title', () => {
    const segs = parseAudioCues('the end of the beginning new chapter the dawn came slowly');
    expect(segs[0]).toEqual({ type: 'text', text: 'the end of the beginning' });
    expect(segs[1]).toEqual({
      type: 'structure',
      event: { kind: 'chapter', title: 'The Dawn Came Slowly' },
    });
    expect(segs.filter((s) => s.type === 'text')).toHaveLength(1);
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

  it('uses the first following sentence as the chapter title', () => {
    const segs = parseAudioCues('new chapter The Exile Returns. Kaeldros crested the ridge');
    expect(segs[0]).toEqual({
      type: 'structure',
      event: { kind: 'chapter', title: 'The Exile Returns' },
    });
    expect(segs[1]).toEqual({ type: 'text', text: 'Kaeldros crested the ridge' });
  });

  it('titles a one-breath new chapter without the word titled', () => {
    const segs = parseAudioCues("new chapter the oracle's warning");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      type: 'structure',
      event: { kind: 'chapter', title: "The Oracle's Warning" },
    });
  });

  it('does not double-title when titled is already spoken', () => {
    const segs = parseAudioCues('new chapter titled The Awakening. the room was cold');
    expect(segs[0]).toEqual({
      type: 'structure',
      event: { kind: 'chapter', title: 'The Awakening' },
    });
    expect(segs[1]).toEqual({ type: 'text', text: 'the room was cold' });
  });

  it('leaves an empty title when nothing follows the cue', () => {
    const segs = parseAudioCues('hello new chapter');
    expect(segs[1]).toEqual({ type: 'structure', event: { kind: 'chapter' } });
  });

  it('keeps a one-breath chapter cue with title and following prose', () => {
    const segs = parseAudioCues('new chapter titled The Gate. the wind howled');
    expect(segs[0]).toEqual({ type: 'structure', event: { kind: 'chapter', title: 'The Gate' } });
    expect(segs[1]).toEqual({ type: 'text', text: 'the wind howled' });
  });

  it('parses short scene and paragraph cues on their own', () => {
    expect(parseAudioCues('new paragraph')).toEqual([{ type: 'structure', event: { kind: 'paragraph' } }]);
    expect(parseAudioCues('new scene')).toEqual([{ type: 'structure', event: { kind: 'scene' } }]);
  });

  it('titles a short following scene name, but not a long narration', () => {
    const named = parseAudioCues('new scene dusk. she waited');
    expect(named[0]).toEqual({ type: 'structure', event: { kind: 'scene', title: 'Dusk' } });
    expect(named[1]).toEqual({ type: 'text', text: 'she waited' });

    const long = parseAudioCues(
      'new scene aleith waited in the dark her eyes bright with a cold glow across the stones',
    );
    expect(long[0]).toEqual({ type: 'structure', event: { kind: 'scene' } });
    expect(long[1]?.type).toBe('text');
  });
});
