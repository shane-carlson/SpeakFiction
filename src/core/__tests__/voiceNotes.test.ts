import { describe, expect, it } from 'vitest';
import {
  assignVoiceNoteBook,
  createRecordVoiceOnlyNote,
  decryptNotePayload,
  encryptNotePayload,
  isSpeakFictionLicenseKey,
  mergeVoiceNotes,
  noteCanDesktopHear,
  noteNeedsDesktopTranscription,
  notesAccountHash,
  RECORD_VOICE_ONLY_LABEL,
  REMOTE_VOICE_TAKE_PLACEHOLDER,
  resolveVoiceNoteBookId,
  transcriptAfterDesktopHear,
  type VoiceNote,
} from '../voiceNotes';

function note(partial: Partial<VoiceNote> & Pick<VoiceNote, 'id' | 'status'>): VoiceNote {
  return {
    createdAt: '2026-08-24T00:00:00.000Z',
    durationMs: 1000,
    platform: 'phone',
    text: partial.text || partial.id,
    source: 'phone',
    ...partial,
  };
}

describe('voice notes identity and crypto', () => {
  it('accepts Polar-style SF keys and rejects junk', () => {
    expect(isSpeakFictionLicenseKey('SF-ABC12345-XYZ')).toBe(true);
    expect(isSpeakFictionLicenseKey('not-a-key')).toBe(false);
    expect(isSpeakFictionLicenseKey('')).toBe(false);
  });

  it('hashes the same key to the same account and encrypts text the server cannot read', async () => {
    const key = 'SF-TESTKEY-NOTES-01';
    const a = await notesAccountHash(key);
    const b = await notesAccountHash(key);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).not.toBe(await notesAccountHash('SF-OTHERKEY-NOTES-02'));

    const envelope = await encryptNotePayload(key, { text: 'the wind howled', bookHint: 'Ash' });
    expect(envelope.v).toBe(1);
    expect(JSON.stringify(envelope)).not.toMatch(/wind howled/);
    await expect(decryptNotePayload(key, envelope)).resolves.toMatchObject({
      kind: 'note',
      text: 'the wind howled',
      bookHint: 'Ash',
    });
  });

  it('keeps a local dismiss when the remote row is still inbox', () => {
    const merged = mergeVoiceNotes(
      [note({ id: 'a', status: 'inbox', text: 'first' }), note({ id: 'b', status: 'inbox', text: 'second' })],
      [note({ id: 'b', status: 'dismissed', text: 'second' })],
    );
    expect(merged.find((item) => item.id === 'b')?.status).toBe('dismissed');
    expect(merged.find((item) => item.id === 'a')?.status).toBe('inbox');
    expect(merged.find((item) => item.id === 'b')?.text).toBe('second');
  });

  it('honors an in-flight dismiss and drops duplicate ids', () => {
    const merged = mergeVoiceNotes(
      [note({ id: 'dup', status: 'inbox', text: 'older' }), note({ id: 'dup', status: 'inbox', text: 'newer', createdAt: '2026-08-24T01:00:00.000Z' })],
      [],
      { dup: 'dismissed' },
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'dup', status: 'dismissed', text: 'newer' });
  });

  it('sends record-only takes to the computer transcriber, not the box as placeholder text', () => {
    expect(noteNeedsDesktopTranscription({ text: REMOTE_VOICE_TAKE_PLACEHOLDER, hasAudio: true, source: 'phone' })).toBe(
      true,
    );
    expect(
      noteNeedsDesktopTranscription({
        text: 'Voice take. Transcribe on the computer.',
        hasAudio: true,
        source: 'phone',
      }),
    ).toBe(true);
    expect(noteNeedsDesktopTranscription({ text: 'the wind howled', hasAudio: true, source: 'phone', recordOnly: true })).toBe(
      true,
    );
    expect(noteNeedsDesktopTranscription({ text: 'the wind howled', hasAudio: true, source: 'phone' })).toBe(false);
    expect(noteNeedsDesktopTranscription({ text: 'the wind howled', hasAudio: false, source: 'phone' })).toBe(false);
    expect(noteCanDesktopHear({ hasAudio: true, source: 'phone' })).toBe(true);
    expect(noteCanDesktopHear({ hasAudio: false, source: 'phone' })).toBe(false);
    expect(noteCanDesktopHear({ hasAudio: true, source: 'file' })).toBe(false);
    expect(noteCanDesktopHear({ hasAudio: true, source: 'desktop' })).toBe(true);
    expect(
      noteNeedsDesktopTranscription({
        text: REMOTE_VOICE_TAKE_PLACEHOLDER,
        hasAudio: true,
        source: 'desktop',
        recordOnly: true,
      }),
    ).toBe(true);
    expect(
      noteNeedsDesktopTranscription({
        text: 'the wind howled',
        hasAudio: true,
        source: 'desktop',
        recordOnly: true,
      }),
    ).toBe(false);
  });

  it('keeps the phone transcript when desktop STT hears silence', () => {
    expect(transcriptAfterDesktopHear('Kaeldros said no.', 'kaldros said no')).toBe('Kaeldros said no.');
    expect(transcriptAfterDesktopHear('  ', 'No, she said no.')).toBe('No, she said no.');
    expect(transcriptAfterDesktopHear('', REMOTE_VOICE_TAKE_PLACEHOLDER)).toBe('');
  });

  it('drops a remote deleted take so a leftover local row cannot come back', () => {
    const merged = mergeVoiceNotes(
      [note({ id: 'gone', status: 'deleted', text: 'Voice take. Transcribe on the computer.' })],
      [note({ id: 'gone', status: 'inbox', text: 'Voice take. Transcribe on the computer.', hasAudio: true })],
    );
    expect(merged.find((item) => item.id === 'gone')).toBeUndefined();
  });
});

describe('record voice only book assignment', () => {
  it('tags a new take with the current book', () => {
    const created = createRecordVoiceOnlyNote({ id: 'bk-ash', title: 'Ash' }, 1500, 'mac');
    expect(created).toMatchObject({
      source: 'desktop',
      recordOnly: true,
      hasAudio: true,
      bookId: 'bk-ash',
      bookHint: 'Ash',
      text: REMOTE_VOICE_TAKE_PLACEHOLDER,
      durationMs: 1500,
      platform: 'mac',
    });
  });

  it('resolves the assigned book, then title hint, then fallback', () => {
    const books = [
      { id: 'bk-ash', title: 'Ash' },
      { id: 'bk-ember', title: 'Ember' },
    ];
    expect(resolveVoiceNoteBookId({ bookId: 'bk-ember', bookHint: 'Ash' }, books, 'bk-ash')).toBe('bk-ember');
    expect(resolveVoiceNoteBookId({ bookHint: 'Ember' }, books, 'bk-ash')).toBe('bk-ember');
    expect(resolveVoiceNoteBookId({}, books, 'bk-ash')).toBe('bk-ash');
    expect(resolveVoiceNoteBookId({ bookId: 'missing' }, books)).toBe('bk-ash');
  });

  it('writes bookId and title onto the take', () => {
    expect(assignVoiceNoteBook({ id: 'bk-ember', title: 'Ember' })).toEqual({
      bookId: 'bk-ember',
      bookHint: 'Ember',
    });
    expect(RECORD_VOICE_ONLY_LABEL).toBe('Record Voice Only');
  });
});
