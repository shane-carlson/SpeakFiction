import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_IMPORT_EXTENSIONS,
  AUDIO_IMPORT_TOO_LARGE_MESSAGE,
  MAX_AUDIO_IMPORT_BYTES,
  decodeImportedAudio,
  importedAudioTooLargeMessage,
  importedAudioTooLongMessage,
  isAudioImportName,
  mimeForAudioImport,
  slicePcmChunks,
} from '../audioImport';
import { peekImportedAudioDurationMs } from '../audioImportDuration';

const require = createRequire(import.meta.url);
const audioLimits = require('../../../electron/audioImportLimits.cjs') as {
  MAX_AUDIO_IMPORT_BYTES: number;
  AUDIO_IMPORT_TOO_LARGE_MESSAGE: string;
  messageIfAudioTooLarge: (byteLength: number) => string | null;
};

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

  it('rejects decoded takes longer than 20 minutes before mix-down', () => {
    expect(importedAudioTooLongMessage(12 * 60 * 1000)).toBeNull();
    expect(importedAudioTooLongMessage(21 * 60 * 1000)).toMatch(/20 minutes/i);
  });

  it('uses the same 40 MB warning as the main process', () => {
    expect(MAX_AUDIO_IMPORT_BYTES).toBe(audioLimits.MAX_AUDIO_IMPORT_BYTES);
    expect(AUDIO_IMPORT_TOO_LARGE_MESSAGE).toBe(audioLimits.AUDIO_IMPORT_TOO_LARGE_MESSAGE);
    expect(importedAudioTooLargeMessage(MAX_AUDIO_IMPORT_BYTES)).toBeNull();
    expect(importedAudioTooLargeMessage(MAX_AUDIO_IMPORT_BYTES + 1)).toBe(AUDIO_IMPORT_TOO_LARGE_MESSAGE);
    expect(audioLimits.messageIfAudioTooLarge(MAX_AUDIO_IMPORT_BYTES + 1)).toBe(AUDIO_IMPORT_TOO_LARGE_MESSAGE);
  });
});

function be32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function atom(type: string, payload: number[]): Uint8Array {
  const size = 8 + payload.length;
  return Uint8Array.from([
    ...be32(size),
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
    ...payload,
  ]);
}

function wavHeader(seconds: number): Uint8Array {
  const sampleRate = 16000;
  const byteRate = sampleRate * 2;
  const dataSize = Math.round(byteRate * seconds);
  const header = new Uint8Array(44);
  header.set([82, 73, 70, 70], 0);
  header.set([87, 65, 86, 69], 8);
  header.set([102, 109, 116, 32], 12);
  header[16] = 16;
  header[20] = 1;
  header[22] = 1;
  header[24] = sampleRate & 255;
  header[25] = (sampleRate >> 8) & 255;
  header[28] = byteRate & 255;
  header[29] = (byteRate >> 8) & 255;
  header[32] = 2;
  header[34] = 16;
  header.set([100, 97, 116, 97], 36);
  header[40] = dataSize & 255;
  header[41] = (dataSize >> 8) & 255;
  header[42] = (dataSize >> 16) & 255;
  header[43] = (dataSize >> 24) & 255;
  return header;
}

function m4aWithDuration(seconds: number): Uint8Array {
  const timescale = 1000;
  const duration = Math.round(seconds * timescale);
  const mvhd = new Array(100).fill(0);
  mvhd.splice(12, 4, ...be32(timescale));
  mvhd.splice(16, 4, ...be32(duration));
  const ftyp = atom('ftyp', [0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0]);
  const moov = atom('moov', Array.from(atom('mvhd', mvhd)));
  const out = new Uint8Array(ftyp.length + moov.length);
  out.set(ftyp, 0);
  out.set(moov, ftyp.length);
  return out;
}

function mp3Xing(frames: number): Uint8Array {
  const frameLength = 417;
  const bytes = new Uint8Array(frameLength);
  bytes[0] = 0xff;
  bytes[1] = 0xfb;
  bytes[2] = 0x90;
  bytes[3] = 0xc0;
  const at = 4 + 17;
  bytes.set([0x58, 0x69, 0x6e, 0x67], at);
  bytes.set(be32(1), at + 4);
  bytes.set(be32(frames), at + 8);
  return bytes;
}

describe('audio import duration gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a long voice memo from the container before any PCM decode', () => {
    expect(peekImportedAudioDurationMs(wavHeader(21 * 60))).toBeGreaterThan(20 * 60 * 1000);
    expect(peekImportedAudioDurationMs(m4aWithDuration(21 * 60))).toBeGreaterThan(20 * 60 * 1000);
    expect(peekImportedAudioDurationMs(mp3Xing(48235))).toBeGreaterThan(20 * 60 * 1000);
    expect(peekImportedAudioDurationMs(wavHeader(12))).toBeLessThan(20 * 60 * 1000);
    expect(peekImportedAudioDurationMs(m4aWithDuration(30))).toBeLessThan(20 * 60 * 1000);
    expect(peekImportedAudioDurationMs(mp3Xing(100))).toBeLessThan(20 * 60 * 1000);
  });

  it('rejects an over-long file before Web Audio can expand it', async () => {
    const Ctx = vi.fn();
    vi.stubGlobal('AudioContext', Ctx);
    await expect(decodeImportedAudio(m4aWithDuration(21 * 60), 'audio/mp4')).rejects.toThrow(/20 minutes/);
    await expect(decodeImportedAudio(wavHeader(21 * 60), 'audio/wav')).rejects.toThrow(
      /longer than 20 minutes/,
    );
    expect(Ctx).not.toHaveBeenCalled();
  });

  it('keeps the 20 minute warning when decode reports a long take', async () => {
    let mixed = false;
    class Ctx {
      decodeAudioData() {
        return Promise.resolve({
          duration: 21 * 60,
          sampleRate: 16000,
          numberOfChannels: 1,
          length: 16000,
          getChannelData() {
            mixed = true;
            return new Float32Array(16000);
          },
        });
      }
      close() {
        return Promise.reject(new Error('close failed'));
      }
    }
    vi.stubGlobal('AudioContext', Ctx);
    await expect(decodeImportedAudio(wavHeader(1), 'audio/wav')).rejects.toThrow(/20 minutes/);
    expect(mixed).toBe(false);
  });

  it('shows the size warning and does not decode an oversized file', async () => {
    const Ctx = vi.fn();
    vi.stubGlobal('AudioContext', Ctx);
    const bytes = new Uint8Array(MAX_AUDIO_IMPORT_BYTES + 1);
    await expect(decodeImportedAudio(bytes, 'audio/wav')).rejects.toThrow(AUDIO_IMPORT_TOO_LARGE_MESSAGE);
    expect(Ctx).not.toHaveBeenCalled();
  });

  it('still decodes a short take into samples', async () => {
    const pcm = new Float32Array([0.25, -0.5]);
    class Ctx {
      decodeAudioData() {
        return Promise.resolve({
          duration: 1,
          sampleRate: 16000,
          numberOfChannels: 1,
          length: pcm.length,
          getChannelData: () => pcm,
        });
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', Ctx);
    const decoded = await decodeImportedAudio(wavHeader(1), 'audio/wav');
    expect(decoded.durationMs).toBe(1000);
    expect(Array.from(decoded.samples)).toEqual([0.25, -0.5]);
    expect(decoded.sampleRate).toBe(16000);
  });

  it('turns a decoder failure into the existing format warning', async () => {
    class Ctx {
      decodeAudioData() {
        return Promise.reject(new Error('Unable to decode audio data'));
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', Ctx);
    await expect(decodeImportedAudio(wavHeader(1), 'audio/wav')).rejects.toThrow(/Could not decode that audio file/);
  });
});
