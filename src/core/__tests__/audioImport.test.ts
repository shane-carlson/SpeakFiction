import { describe, expect, it } from 'vitest';
import {
  AUDIO_IMPORT_EXTENSIONS,
  isAudioImportName,
  mimeForAudioImport,
  slicePcmChunks,
} from '../audioImport';

describe('audio import formats', () => {
  it('accepts common voice-memo extensions', () => {
    expect(isAudioImportName('take.m4a')).toBe(true);
    expect(isAudioImportName('memo.wav')).toBe(true);
    expect(isAudioImportName('/tmp/scene.mp3')).toBe(true);
    expect(isAudioImportName('clip.aac')).toBe(true);
    expect(isAudioImportName('voice.caf')).toBe(true);
    expect(isAudioImportName('note.ogg')).toBe(true);
    expect(isAudioImportName('room.flac')).toBe(true);
    expect(isAudioImportName('outline.docx')).toBe(false);
    expect(AUDIO_IMPORT_EXTENSIONS).toContain('m4a');
    expect(mimeForAudioImport('Voice Memo.m4a')).toBe('audio/mp4');
  });

  it('splits a long take into decode chunks without dropping samples', () => {
    const samples = new Float32Array(16000 * 100);
    samples[0] = 0.5;
    samples[samples.length - 1] = -0.25;
    const chunks = slicePcmChunks(samples, 16000, 45);
    expect(chunks.length).toBe(3);
    expect(chunks.reduce((n, c) => n + c.length, 0)).toBe(samples.length);
    expect(chunks[0][0]).toBe(0.5);
    expect(chunks[chunks.length - 1][chunks[chunks.length - 1].length - 1]).toBe(-0.25);
  });
});
