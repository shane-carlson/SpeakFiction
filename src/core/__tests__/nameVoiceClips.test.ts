import { describe, expect, it } from 'vitest';
import { encodePcmWav, NAME_VOICE_MIME, WAV_SAMPLE_RATE } from '../pcmWav';
import { loadRawMedia } from '../mediaStore';
import {
  clipHasTwoSayings,
  heardAliasesFromClips,
  mergeNameVoiceClips,
  nameVoiceTrainingComplete,
  persistNameVoiceClip,
} from '../nameVoiceClips';

describe('encodePcmWav', () => {
  it('writes a 16 kHz mono WAV header', () => {
    const pcm = new Float32Array(1600);
    pcm[10] = 0.5;
    const wav = encodePcmWav(pcm, WAV_SAMPLE_RATE);
    const ascii = (start: number, n: number) => String.fromCharCode(...wav.slice(start, start + n));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(WAV_SAMPLE_RATE);
    expect(wav.byteLength).toBe(44 + pcm.length * 2);
  });
});

describe('name voice clips', () => {
  it('treats a dictation New Character clip as already trained', () => {
    expect(
      nameVoiceTrainingComplete([{ mediaId: 'nvc_1', source: 'dictation', heard: 'Fae Fae' }]),
    ).toBe(true);
    expect(nameVoiceTrainingComplete([{ mediaId: 'nvc_1', source: 'library', heard: 'Fae' }])).toBe(false);
  });

  it('counts two library takes, or one take that said the name twice', () => {
    expect(
      nameVoiceTrainingComplete([
        { mediaId: 'a', source: 'library', heard: 'Fae' },
        { mediaId: 'b', source: 'library', heard: 'Fae' },
      ]),
    ).toBe(true);
    expect(clipHasTwoSayings({ mediaId: 'a', heard: 'Andreos Andreus' })).toBe(true);
    expect(nameVoiceTrainingComplete([{ mediaId: 'a', source: 'library', heard: 'Andreos Andreus' }])).toBe(
      true,
    );
  });

  it('merges clips by media id and pulls distinct heard forms as aliases', () => {
    const merged = mergeNameVoiceClips(
      [{ mediaId: 'a', heard: 'Fae', source: 'dictation' }],
      [{ mediaId: 'a', heard: 'ignored' }, { mediaId: 'b', heard: 'stay' }],
    );
    expect(merged).toEqual([
      { mediaId: 'a', heard: 'Fae', source: 'dictation' },
      { mediaId: 'b', heard: 'stay' },
    ]);
    expect(heardAliasesFromClips(merged, 'Fae')).toEqual(['stay']);
  });

  it('persists a wav clip that can be loaded back', async () => {
    const samples = new Float32Array(800);
    samples.fill(0.2);
    const clip = await persistNameVoiceClip(samples, WAV_SAMPLE_RATE, { heard: 'Fae', source: 'library' });
    const loaded = await loadRawMedia(clip.mediaId);
    expect(clip.heard).toBe('Fae');
    expect(loaded?.mime).toBe(NAME_VOICE_MIME);
    expect(loaded?.bytes.byteLength).toBe(44 + samples.length * 2);
  });
});

describe('stored media mime', () => {
  it('keeps wav as a first-class backup mime', () => {
    expect(NAME_VOICE_MIME).toBe('audio/wav');
  });
});
