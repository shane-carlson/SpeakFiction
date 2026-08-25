import { useEffect, useState } from 'react';
import type { Book } from '../core/types';
import { getGenre } from '../core/genres';
import { getTense } from '../core/tense';
import { getPerspective } from '../core/perspective';
import {
  AUDIO_IMPORT_ACCEPT,
  AUDIO_IMPORT_FILTERS,
  isAudioImportName,
  mimeForAudioImport,
} from '../core/audioImport';
import { createVoiceNoteId, noteNeedsDesktopTranscription, REMOTE_VOICE_TAKE_PLACEHOLDER, type VoiceNote } from '../core/voiceNotes';
import { transcribeImportedAudioFile, type AudioImportProgress } from '../core/transcribeAudioImport';
import { openBytesFile, openTextFile } from '../core/localFiles';
import { useStore } from '../store';
import { useVoiceNotes } from '../hooks/useVoiceNotes';
import type { useLicense } from '../hooks/useLicense';
import { LicenseGate } from '../components/LicenseGate';
import { CompanionLinkSetup } from '../components/CompanionLinkSetup';

export function VoiceNotesView({
  book,
  license,
  onOpenDictate,
}: {
  book: Book;
  license: ReturnType<typeof useLicense>;
  onOpenDictate: () => void;
}) {
  const genre = getGenre(book.genreId);
  const tense = getTense(book.tenseId);
  const perspective = getPerspective(book.perspectiveId);
  const importToBox = useStore((s) => s.importToTranscriptionBox);
  const inbox = useVoiceNotes();
  const [paste, setPaste] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<AudioImportProgress | null>(null);
  const [importingNoteId, setImportingNoteId] = useState<string | null>(null);

  const report = (message: string) => {
    setError(null);
    setStatus(message);
  };

  const fail = (message: string) => {
    setStatus(null);
    setError(message);
    setImportProgress(null);
    setImportingNoteId(null);
  };

  const books = useStore((s) => s.books);

  const landInBox = async (note: VoiceNote) => {
    const fromAudio = noteNeedsDesktopTranscription(note) || note.source === 'file';
    const target =
      books.find((item) => item.id === note.bookId) ??
      books.find((item) => note.bookHint && item.title === note.bookHint) ??
      book;
    let text = note.text;
    try {
      if (noteNeedsDesktopTranscription(note)) {
        setImporting(true);
        setImportingNoteId(note.id);
        setImportProgress({ fraction: 0.04, label: 'Reading the take from this computer…' });
        const audio = await window.speakfiction?.notes?.readAudio(note.id);
        if (!audio?.ok || !audio.bytes?.length) {
          fail(audio?.message || 'This take has no audio on this computer. Send it again from the phone.');
          return;
        }
        report('Transcribing this take on the computer…');
        const heard = await transcribeImportedAudioFile(
          new Uint8Array(audio.bytes),
          audio.mime || 'audio/mp4',
          setImportProgress,
        );
        text = heard.text;
        if (!text) {
          fail('The on-device model did not hear words in that file.');
          return;
        }
      }
      if (fromAudio) {
        setImportProgress({ fraction: 0.97, label: 'Adding names and structure cues…' });
      }
      const result = importToBox(target.id, text);
      if (!result.added && !result.cleaned) {
        fail('Nothing to add. The take was empty after cleanup.');
        return;
      }
      await inbox.setStatus(note.id, 'imported', { text });
      setImportProgress(null);
      report(
        fromAudio
          ? 'Imported into the transcription box. The audio stays on this computer until you delete the take.'
          : 'Added to the transcription box. The audio stays on this computer until you delete the take.',
      );
      onOpenDictate();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not import that take.');
    } finally {
      if (noteNeedsDesktopTranscription(note)) {
        setImporting(false);
        setImportingNoteId(null);
      }
    }
  };

  const removeNote = async (note: VoiceNote) => {
    if (
      !window.confirm(
        'Delete this take from the inbox? Any audio saved on this computer will be removed. Deleting it on the phone does the same.',
      )
    ) {
      return;
    }
    await inbox.setStatus(note.id, 'deleted');
    report('Removed from this computer.');
  };

  const remember = async (partial: Omit<VoiceNote, 'id' | 'createdAt' | 'status'>) => {
    const note: VoiceNote = {
      ...partial,
      id: createVoiceNoteId(),
      createdAt: new Date().toISOString(),
      status: 'inbox',
    };
    await inbox.addLocal(note);
    return note;
  };

  const importAudio = async () => {
    if (!license.mayDictate) return;
    setError(null);
    const res = await openBytesFile({
      filters: AUDIO_IMPORT_FILTERS,
      accept: AUDIO_IMPORT_ACCEPT,
    });
    if (!res.ok || !res.bytes) return;
    if (res.path && !isAudioImportName(res.path)) {
      fail('Choose a WAV, M4A, MP3, AAC, OGG, FLAC, CAF, or similar audio file.');
      return;
    }
    setImporting(true);
    setImportProgress({ fraction: 0.03, label: 'Reading the audio file…' });
    try {
      const { text, durationMs } = await transcribeImportedAudioFile(
        res.bytes,
        res.mime || mimeForAudioImport(res.path),
        setImportProgress,
      );
      if (!text) {
        fail('The on-device model did not hear words in that file.');
        return;
      }
      const note = await remember({
        durationMs,
        platform: window.speakfiction?.platform || 'desktop',
        text,
        bookHint: book.title,
        source: 'file',
        fileName: res.path?.split(/[/\\]/).pop(),
      });
      await landInBox(note);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not import that audio file.');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const importTextFile = async () => {
    const content = await openTextFile({
      filters: [
        { name: 'Text', extensions: ['txt', 'md'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (content == null) return;
    const text = content.trim();
    if (!text) {
      fail('That text file was empty.');
      return;
    }
    const note = await remember({
      durationMs: 0,
      platform: window.speakfiction?.platform || 'desktop',
      text,
      bookHint: book.title,
      source: 'paste',
      fileName: 'imported.txt',
    });
    await landInBox(note);
  };

  const importPasted = async () => {
    const text = paste.trim();
    if (!text) return;
    const note = await remember({
      durationMs: 0,
      platform: window.speakfiction?.platform || 'desktop',
      text,
      bookHint: book.title,
      source: 'paste',
    });
    setPaste('');
    await landInBox(note);
  };

  const inboxNotes = inbox.notes.filter((n) => n.status === 'inbox');
  const otherNotes = inbox.notes.filter((n) => n.status !== 'inbox');

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Voice notes</h2>
          <p>
            The phone hears the take. Your computer shapes the book. Synced audio stays on this
            computer until you delete the take here or on the phone. Voice-only takes appear here as
            audio; import them to transcribe.
          </p>
        </div>
        <div className="book-pill">
          <span>📝</span>
          <b>{book.title}</b>
          <span>
            · {genre.name} · {tense.name} · {perspective.name}
          </span>
        </div>
      </div>

      <div className="note-banner" style={{ marginBottom: 18 }}>
        <span className="ico">🎙️</span>
        <div>
          The phone companion is included with a license and does not use one of your three desktop
          seats. Scan the QR code or copy the SF- key in the setup below. The phone does not
          activate Polar.
        </div>
      </div>

      <LicenseGate license={license} />

      {(status || error || inbox.error) && (
        <div className={`note-banner ${error || inbox.error ? 'warn' : ''}`} style={{ marginBottom: 18 }}>
          <span className="ico">{error || inbox.error ? '⚠️' : '✅'}</span>
          <div>{error ?? inbox.error ?? status}</div>
        </div>
      )}

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Import on this computer</h3>
          <p className="sub">
            WAV, M4A, MP3, AAC, OGG, FLAC, CAF, and other common voice-memo formats. Speech is
            decoded here, then names and structure cues run as you add the take to the transcription
            box. Nothing is inserted into the manuscript until you do that yourself.
          </p>
          <div className="row wrap">
            <button
              type="button"
              className="btn primary"
              disabled={importing || !license.mayDictate}
              onClick={() => void importAudio()}
            >
              {importing ? 'Transcribing…' : 'Import audio'}
            </button>
            <button type="button" className="btn" disabled={importing} onClick={() => void importTextFile()}>
              Import text
            </button>
            <button type="button" className="btn" disabled={inbox.busy} onClick={() => void inbox.refresh()}>
              {inbox.busy ? 'Refreshing…' : 'Refresh inbox'}
            </button>
          </div>
          {importProgress && !importingNoteId ? <AudioImportProgressBar progress={importProgress} /> : null}
          <label style={{ display: 'block', marginTop: 14 }}>
            Paste a transcript
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder="A take from another recorder…"
              style={{ width: '100%', marginTop: 6 }}
            />
          </label>
          <button type="button" className="btn" disabled={!paste.trim()} onClick={() => void importPasted()}>
            Add pasted text to transcription box
          </button>
        </div>

        <CompanionLinkSetup paired={inbox.paired} />
      </div>

      <div className="card voice-notes-inbox">
        <h3>Inbox</h3>
        <p className="sub">
          Add a transcribed note to the transcription box to run names, cues, and genre punctuation.
          Voice-only takes play here first — import the audio to transcribe. Insert into the
          manuscript stays a separate step.
        </p>
        {inboxNotes.length === 0 ? (
          <p className="hint">No waiting notes. Import a file or send a take from the phone.</p>
        ) : (
          <ul className="voice-note-list">
            {inboxNotes.map((note) => (
              <VoiceNoteRow
                key={note.id}
                note={note}
                progress={importingNoteId === note.id ? importProgress : null}
                onAdd={importing || noteNeedsDesktopTranscription(note) ? undefined : () => void landInBox(note)}
                onImportAudio={
                  !noteNeedsDesktopTranscription(note) || (importing && importingNoteId !== note.id)
                    ? undefined
                    : () => void landInBox(note)
                }
                onDelete={importingNoteId === note.id ? undefined : () => void removeNote(note)}
              />
            ))}
          </ul>
        )}
        {otherNotes.length > 0 && (
          <>
            <h3 style={{ marginTop: 22 }}>Already handled</h3>
            <ul className="voice-note-list">
              {otherNotes.map((note) => (
                <VoiceNoteRow key={note.id} note={note} onDelete={() => void removeNote(note)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function AudioImportProgressBar({ progress, compact }: { progress: AudioImportProgress; compact?: boolean }) {
  const percent = Math.round(Math.min(100, Math.max(0, progress.fraction * 100)));
  return (
    <div className={`audio-import-progress${compact ? ' audio-import-progress--row' : ''}`}>
      <div className="audio-import-progress__label" aria-live="polite">
        {progress.label} {percent}%
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={progress.label}
      >
        <span style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
    </div>
  );
}

function InboxAudioPlayer({ noteId }: { noteId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('Loading audio…');

  useEffect(() => {
    let blobUrl: string | undefined;
    let cancelled = false;
    void window.speakfiction?.notes?.readAudio(noteId).then((audio) => {
      if (cancelled) return;
      if (!audio?.ok || !audio.bytes?.length) {
        setMessage(audio?.message || 'This take has no audio on this computer. Send it again from the phone.');
        return;
      }
      const blob = new Blob([new Uint8Array(audio.bytes)], { type: audio.mime || 'audio/mp4' });
      blobUrl = URL.createObjectURL(blob);
      setUrl(blobUrl);
    });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [noteId]);

  if (!url) return <p className="hint">{message}</p>;
  return <audio className="voice-note-audio" controls preload="metadata" src={url} />;
}

function VoiceNoteRow({
  note,
  progress,
  onAdd,
  onImportAudio,
  onDelete,
}: {
  note: VoiceNote;
  progress?: AudioImportProgress | null;
  onAdd?: () => void;
  onImportAudio?: () => void;
  onDelete?: () => void;
}) {
  const when = new Date(note.createdAt);
  const stamp = Number.isNaN(when.getTime()) ? note.createdAt : when.toLocaleString();
  const seconds = note.durationMs > 0 ? `${Math.max(1, Math.round(note.durationMs / 1000))}s` : null;
  const voiceOnly = noteNeedsDesktopTranscription(note);
  return (
    <li className="voice-note-row">
      <div>
        <div className="voice-note-meta">
          <b>{note.source === 'phone' ? 'Phone' : note.source === 'file' ? 'Audio file' : 'Text'}</b>
          <span>· {stamp}</span>
          {seconds ? <span>· {seconds}</span> : null}
          {note.title ? <span>· {note.title}</span> : null}
          {note.fileName ? <span>· {note.fileName}</span> : null}
          {note.bookHint ? <span>· {note.bookHint}</span> : null}
          {note.hasAudio ? <span>· audio on this computer</span> : null}
          {voiceOnly ? <span>· voice only</span> : null}
          <span className="badge">{note.status}</span>
        </div>
        {voiceOnly ? (
          <>
            <p className="voice-note-text">{REMOTE_VOICE_TAKE_PLACEHOLDER}</p>
            {note.hasAudio ? <InboxAudioPlayer noteId={note.id} /> : null}
            {progress ? <AudioImportProgressBar progress={progress} compact /> : null}
          </>
        ) : (
          <p className="voice-note-text">{note.text || '(empty take)'}</p>
        )}
      </div>
      {onAdd || onImportAudio || onDelete ? (
        <div className="row wrap">
          {onImportAudio ? (
            <button type="button" className="btn primary" disabled={Boolean(progress)} onClick={onImportAudio}>
              {progress ? 'Transcribing…' : 'Import audio'}
            </button>
          ) : null}
          {onAdd ? (
            <button type="button" className="btn primary" onClick={onAdd}>
              Add to transcription box
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className="btn" onClick={onDelete}>
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
