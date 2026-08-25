import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import { decryptNotePayload, encryptNotePayload, SF_LICENSE_KEY_RE } from './src/notesCrypto';
import { listNotes, openNotesSession, patchNoteStatus, pushNote } from './src/notesApi';
import { transcribeAudioFile } from './src/onDeviceStt';
import { parseCompanionPairing } from './src/companionPairing';
import {
  THEME_LIST,
  resolveColors,
  type ThemeColors,
  type ThemeId,
  type ThemeMode,
} from './src/theme';
import { MicIcon, PauseIcon } from './src/MicIcon';
import { getCachedPrefs, loadCompanionPrefs, persistCompanionPrefs } from './src/prefs';
import {
  BOOK_GENRES,
  CREATE_NAME_PREFIX,
  LIBRARY_NOTE_ID,
  bookLabel,
  createBookId,
  createBookNoteId,
  createNameNoteId,
  guessNameCategory,
  loadCachedBooks,
  mergeBooks,
  parseCompanionBooks,
  saveCachedBooks,
  type CompanionBook,
} from './src/books';
import {
  isShareDismissed,
  shareAudioTake,
  shareKindFor,
  shareLocalFile,
  shareTranscriptTake,
} from './src/noteFiles';
import { ScreenKeyboardAvoid, useKeyboardHeight } from './src/keyboardAvoid';
import { LibraryScreen } from './src/LibraryScreen';
import { useHorizontalSwipe } from './src/pageSwipe';
import {
  applyVocab,
  applyVocabToWords,
  contextualStrings,
  loadSpeechVocab,
  taughtWordSet,
  upsertSpeechCues,
  type SpeechCue,
  type TaughtPair,
} from './src/speechVocab';
import {
  createTakeId,
  defaultTakeTitle,
  exportTakeCopy,
  keepLibraryAudio,
  loadTakes,
  readTakeAudioAttachment,
  removeTakes,
  upsertTake,
  type LibraryTake,
} from './src/takeLibrary';
import { downsamplePeaks, wordsForTake, type WordCue } from './src/wordCues';

const logo = require('./assets/speakfiction-logo.png');
const KEY_STORE = 'sf-companion-license';
const RING_TICKS = 48;
const RING_SIZE = 148;
const MIC_SIZE = 88;
const TOP_INSET = Platform.OS === 'ios' ? 62 : (StatusBar.currentHeight ?? 0) + 8;

type LocalNote = {
  id: string;
  createdAt: string;
  durationMs: number;
  text: string;
  sent?: boolean;
  recordOnly?: boolean;
};

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ProgressRing({
  progress,
  color,
  track,
}: {
  progress: number;
  color: string;
  track: string;
}) {
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * RING_TICKS);
  const ticks = [];
  for (let i = 0; i < RING_TICKS; i++) {
    const deg = (i / RING_TICKS) * 360;
    ticks.push(
      <View
        key={i}
        style={[
          ringStyles.tickWrap,
          { transform: [{ rotate: `${deg}deg` }] },
        ]}
      >
        <View
          style={[
            ringStyles.tick,
            { backgroundColor: i < filled ? color : track },
          ]}
        />
      </View>,
    );
  }
  return <View style={ringStyles.ring}>{ticks}</View>;
}

const ringStyles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickWrap: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
  },
  tick: {
    width: 3,
    height: 11,
    borderRadius: 2,
    marginTop: 2,
  },
});

export default function App() {
  const initialPrefs = getCachedPrefs();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(initialPrefs.mode);
  const [themeId, setThemeId] = useState<ThemeId>(initialPrefs.themeId);
  const colors = useMemo(() => resolveColors(mode, themeId), [mode, themeId]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const themeName = THEME_LIST.find((item) => item.id === themeId)?.name ?? 'Theme';

  const [key, setKey] = useState('');
  const [keyLocked, setKeyLocked] = useState(false);
  const [token, setToken] = useState('');
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('Scan the QR on your computer, or paste your SF- key.');
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [scanning, setScanning] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [books, setBooks] = useState<CompanionBook[]>([]);
  const [bookId, setBookId] = useState<string | null>(initialPrefs.bookId);
  const [bookTitle, setBookTitle] = useState<string | null>(initialPrefs.bookTitle);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookGenre, setNewBookGenre] = useState<(typeof BOOK_GENRES)[number]['id']>('fantasy');
  const [transcribeOnPhone, setTranscribeOnPhone] = useState(initialPrefs.transcribeOnPhone);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [takeAt, setTakeAt] = useState(() => new Date().toISOString());
  const takeAtRef = useRef(takeAt);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [takes, setTakes] = useState<LibraryTake[]>([]);
  const [vocab, setVocab] = useState<SpeechCue[]>([]);
  const [screen, setScreen] = useState<'record' | 'library'>('record');
  const keyboardHeight = useKeyboardHeight();
  const compactStage = keyboardHeight > 0 && !recording;
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(null);
  const bookTargetRef = useRef<'session' | string>('session');
  const scannedRef = useRef(false);
  const [cameraPerm, requestCamera] = useCameraPermissions();
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAt = useRef(0);
  const accumulatedMs = useRef(0);
  const peaksRef = useRef<number[]>([]);
  const transcribeRef = useRef(true);
  const recordingOn = useRef(false);
  const micBusy = useRef(false);
  const ignoreStartUntil = useRef(0);
  const pressAt = useRef(0);
  const startedThisPress = useRef(false);
  const micAbort = useRef(false);
  const micOriginX = useRef(0);
  const micArm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkedKeyRef = useRef('');
  const vocabRef = useRef<SpeechCue[]>([]);
  const linked = Boolean(token);
  const taughtWords = useMemo(() => taughtWordSet(vocab), [vocab]);

  useEffect(() => {
    vocabRef.current = vocab;
  }, [vocab]);

  useEffect(() => {
    recordingOn.current = recording;
  }, [recording]);

  useEffect(() => {
    transcribeRef.current = transcribeOnPhone;
  }, [transcribeOnPhone]);

  useEffect(() => {
    void (async () => {
      const prefs = await loadCompanionPrefs();
      setMode(prefs.mode);
      setThemeId(prefs.themeId);
      setTranscribeOnPhone(prefs.transcribeOnPhone);
      setBookId(prefs.bookId);
      setBookTitle(prefs.bookTitle);
      setBooks(await loadCachedBooks());
      setTakes(await loadTakes());
      setVocab(await loadSpeechVocab());
      try {
        const storedKey = await SecureStore.getItemAsync(KEY_STORE);
        if (storedKey) {
          setKey(storedKey);
          linkedKeyRef.current = storedKey;
          setKeyLocked(true);
          void signIn(storedKey);
        }
      } catch {
        // License key is optional on first launch.
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setElapsedMs(accumulatedMs.current + (startedAt.current ? Date.now() - startedAt.current : 0));
      const rec = recordingRef.current;
      if (!rec) return;
      void rec.getStatusAsync().then((status) => {
        if (!status.isRecording || typeof status.metering !== 'number') return;
        peaksRef.current.push(Math.min(1, Math.max(0.08, (status.metering + 50) / 50)));
      });
    }, 200);
    return () => clearInterval(id);
  }, [recording]);

  const persistMode = useCallback(async (next: ThemeMode) => {
    setMode(next);
    await persistCompanionPrefs({ mode: next });
  }, []);

  const persistTheme = useCallback(async (next: ThemeId) => {
    setThemeId(next);
    setThemeOpen(false);
    await persistCompanionPrefs({ themeId: next });
  }, []);

  const persistTranscribe = useCallback(async (next: boolean) => {
    setTranscribeOnPhone(next);
    await persistCompanionPrefs({ transcribeOnPhone: next });
  }, []);

  const goRecord = useCallback(() => {
    setScreen('record');
    setScanning(false);
    setBookOpen(false);
    setThemeOpen(false);
  }, []);

  const openLink = useCallback(() => {
    scannedRef.current = false;
    setScanning(true);
  }, []);

  const persistBook = useCallback(async (nextId: string | null, nextTitle: string | null) => {
    const target = bookTargetRef.current;
    setBookOpen(false);
    if (target !== 'session') {
      setTakes((prev) => {
        const current = prev.find((take) => take.id === target);
        if (!current) return prev;
        const next = { ...current, bookId: nextId, bookTitle: nextTitle };
        void upsertTake(prev, next);
        return [next, ...prev.filter((take) => take.id !== target)];
      });
      return;
    }
    setBookId(nextId);
    setBookTitle(nextTitle);
    await persistCompanionPrefs({ bookId: nextId, bookTitle: nextTitle });
  }, []);

  const applyCatalog = useCallback((incoming: CompanionBook[]) => {
    setBooks((prev) => {
      const next = mergeBooks(prev, incoming);
      void saveCachedBooks(next);
      return next;
    });
  }, []);

  const signIn = async (nextKey?: string) => {
    const trimmed = (nextKey ?? key).trim();
    if (!SF_LICENSE_KEY_RE.test(trimmed)) {
      setStatus('Scan the QR on your computer, or paste the SF- key. The phone does not activate Polar.');
      return;
    }
    setKey(trimmed);
    try {
      const session = await openNotesSession(trimmed);
      await SecureStore.setItemAsync(KEY_STORE, trimmed);
      setToken(session.token);
      linkedKeyRef.current = trimmed;
      setKeyLocked(true);
      setScanning(false);
      setStatus('Linked. This phone is included with your license.');
      const remote = await listNotes(session.token);
      const opened: LocalNote[] = [];
      for (const row of remote) {
        const envelope = row.ciphertext as { v: 1; iv: string; ct: string } | undefined;
        const openedNote = envelope ? await decryptNotePayload(trimmed, envelope) : { kind: 'note', text: '' };
        if (openedNote.kind === 'library' || row.id === LIBRARY_NOTE_ID) {
          applyCatalog(parseCompanionBooks(openedNote.books));
          continue;
        }
        if (openedNote.kind === 'create-book' || String(row.id).startsWith('sf_book_')) continue;
        if (openedNote.kind === 'create-name' || String(row.id).startsWith(CREATE_NAME_PREFIX)) continue;
        if (row.status === 'deleted') continue;
        opened.push({
          id: String(row.id),
          createdAt: String(row.createdAt),
          durationMs: Number(row.durationMs) || 0,
          text: openedNote.text,
          sent: true,
        });
      }
      setNotes(opened);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not link this phone.');
    }
  };

  const confirmLink = (nextKey: string) => {
    const trimmed = nextKey.trim();
    if (!SF_LICENSE_KEY_RE.test(trimmed)) return;
    if (linkedKeyRef.current === trimmed && token) return;
    const tail = trimmed.slice(-4);
    Alert.alert(
      'Link this phone?',
      `Use the key ending in ${tail} to identify the desktop inbox. This does not use a desktop seat.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Link', onPress: () => void signIn(trimmed) },
      ],
    );
  };

  useEffect(() => {
    if (!ready || keyLocked) return;
    const trimmed = key.trim();
    if (!SF_LICENSE_KEY_RE.test(trimmed) || trimmed === linkedKeyRef.current) return;
    const id = setTimeout(() => confirmLink(trimmed), 800);
    return () => clearTimeout(id);
  }, [key, keyLocked, ready]);

  const addBook = async () => {
    const title = newBookTitle.trim();
    if (!title) return;
    const id = createBookId();
    const created: CompanionBook = { id, title, genreId: newBookGenre };
    applyCatalog([created]);
    await persistBook(id, title);
    setNewBookTitle('');
    if (token && key.trim()) {
      try {
        await pushNote(token, {
          id: createBookNoteId(id),
          createdAt: new Date().toISOString(),
          durationMs: 0,
          platform: 'phone',
          ciphertext: await encryptNotePayload(key.trim(), {
            kind: 'create-book',
            id,
            title,
            genreId: newBookGenre,
          }),
        });
        setStatus(`Added “${title}”. It will appear in the desktop library after Voice notes refreshes.`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Saved the book on this phone. Link to send it to the computer.');
      }
    } else {
      setStatus(`Added “${title}” on this phone. Link to send it to the computer.`);
    }
  };

  const start = async () => {
    if (micBusy.current || recordingOn.current || Date.now() < ignoreStartUntil.current) return;
    micBusy.current = true;
    recordingOn.current = true;
    setRecording(true);
    setStatus(transcribeRef.current ? 'Recording audio and a transcript…' : 'Recording. The computer will transcribe.');
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      if (!recordingOn.current) {
        try {
          await rec.stopAndUnloadAsync();
        } catch {
          /* cancelled before start */
        }
        return;
      }
      await rec.startAsync();
      if (!recordingOn.current) {
        try {
          await rec.stopAndUnloadAsync();
        } catch {
          /* cancelled after start */
        }
        return;
      }
      recordingRef.current = rec;
      startedAt.current = Date.now();
      accumulatedMs.current = 0;
      peaksRef.current = [];
      const stamp = new Date().toISOString();
      takeAtRef.current = stamp;
      setTakeAt(stamp);
      setAudioUri(null);
      setCurrentTakeId(null);
      setDraft('');
      setElapsedMs(0);
    } catch (err) {
      recordingOn.current = false;
      setRecording(false);
      setStatus(err instanceof Error ? err.message : 'Could not start recording.');
    } finally {
      micBusy.current = false;
    }
  };

  const stop = async () => {
    if (!recordingOn.current && !recordingRef.current) return;
    micBusy.current = true;
    recordingOn.current = false;
    ignoreStartUntil.current = Date.now() + 600;
    const rec = recordingRef.current;
    recordingRef.current = null;
    const duration = accumulatedMs.current + (startedAt.current ? Date.now() - startedAt.current : 0);
    accumulatedMs.current = duration;
    startedAt.current = 0;
    setElapsedMs(duration);
    setRecording(false);
    const recUri = rec ? rec.getURI() : null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* already stopped */
      }
    }
    const takeId = createTakeId();
    let stored = recUri;
    if (recUri) {
      try {
        stored = await keepLibraryAudio(takeId, recUri);
      } catch {
        stored = recUri;
      }
    }
    setAudioUri(stored);
    let heard = { text: '', words: [] as WordCue[] };
    const taught = vocabRef.current;
    if (transcribeRef.current && stored) {
      setStatus('Transcribing the take on this phone…');
      heard = await transcribeAudioFile(stored, {
        contextualStrings: contextualStrings(taught),
        replacements: taught.map((item) => ({ heard: item.heard || item.word, word: item.word })),
        durationMs: duration,
      });
    }
    const text = applyVocab(heard.text, taught);
    if (text) setDraft(text);
    const createdAt = takeAtRef.current;
    const peaks = downsamplePeaks(peaksRef.current);
    const words = wordsForTake(
      text,
      duration,
      heard.words.length ? applyVocabToWords(heard.words, taught) : undefined,
      peaks,
    );
    const take: LibraryTake = {
      id: takeId,
      title: defaultTakeTitle(createdAt),
      createdAt,
      durationMs: duration,
      text,
      audioUri: stored,
      bookId,
      bookTitle,
      recordOnly: !transcribeRef.current,
      words,
      peaks,
    };
    setCurrentTakeId(takeId);
    setTakes((prev) => {
      void upsertTake(prev, take);
      return [take, ...prev.filter((item) => item.id !== takeId)];
    });
    setStatus(
      transcribeRef.current
        ? 'Audio and transcript are in Library. Open Library to check the text or send it.'
        : 'Take kept in Library. Open Library to send it so the computer can transcribe, or to play it.',
    );
    micBusy.current = false;
  };

  const clearMicArm = () => {
    if (micArm.current) {
      clearTimeout(micArm.current);
      micArm.current = null;
    }
  };

  const abortMicGesture = () => {
    micAbort.current = true;
    clearMicArm();
  };

  const onMicIn = (event: { nativeEvent: { pageX: number } }) => {
    micAbort.current = false;
    micOriginX.current = event.nativeEvent.pageX;
    pressAt.current = Date.now();
    startedThisPress.current = false;
    clearMicArm();
    if (recordingOn.current) return;
    micArm.current = setTimeout(() => {
      micArm.current = null;
      if (micAbort.current || recordingOn.current) return;
      startedThisPress.current = true;
      void start();
    }, 160);
  };

  const onMicMove = (event: { nativeEvent: { pageX: number } }) => {
    if (Math.abs(event.nativeEvent.pageX - micOriginX.current) > 16) abortMicGesture();
  };

  const onMicOut = () => {
    const aborted = micAbort.current;
    clearMicArm();
    if (aborted) return;
    if (startedThisPress.current && recordingOn.current) {
      void stop();
    }
  };

  const onMicPress = () => {
    if (micAbort.current || startedThisPress.current) return;
    if (recordingOn.current) void stop();
    else void start();
  };

  const markTake = (id: string, patch: Partial<LibraryTake>) => {
    setTakes((prev) => {
      const current = prev.find((item) => item.id === id);
      if (!current) return prev;
      const next = { ...current, ...patch };
      void upsertTake(prev, next);
      return [next, ...prev.filter((item) => item.id !== id)];
    });
  };

  const openLibrary = () => {
    if (currentTakeId) markTake(currentTakeId, { text: draft });
    setScreen('library');
  };

  const recordSwipe = useHorizontalSwipe({
    onSwipeLeft: openLibrary,
    onGrant: abortMicGesture,
    enabled: !recording && !scanning && !bookOpen && !themeOpen,
  });
  const scanSwipe = useHorizontalSwipe({
    onSwipeRight: goRecord,
  });

  const sendNote = async (opts: {
    text: string;
    durationMs: number;
    bookId: string | null;
    bookTitle: string | null;
    recordOnly: boolean;
    takeId?: string | null;
  }) => {
    if (!token) {
      Alert.alert('Link this phone first', 'Scan the QR in Voice notes, or paste your SF- key.');
      return;
    }
    const note: LocalNote = {
      id: opts.takeId || `vn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      durationMs: opts.durationMs,
      text: opts.text,
      recordOnly: opts.recordOnly,
    };
    const selected = books.find((item) => item.id === opts.bookId);
    const take = opts.takeId ? takes.find((item) => item.id === opts.takeId) : null;
    const audio = await readTakeAudioAttachment(take?.audioUri || audioUri);
    if (opts.recordOnly && !audio) {
      throw new Error('This take has no audio file to send. Record it again, then send.');
    }
    const fields = {
      kind: 'note' as const,
      text: opts.text,
      title: take?.title,
      bookId: selected?.id,
      bookHint: selected?.title || opts.bookTitle || undefined,
      recordOnly: opts.recordOnly,
    };
    setStatus(audio ? 'Sending the take and audio…' : 'Sending…');
    let attached = Boolean(audio);
    try {
      await pushNote(token, {
        id: note.id,
        createdAt: note.createdAt,
        durationMs: note.durationMs,
        platform: 'phone',
        fileName: take?.title,
        ciphertext: await encryptNotePayload(key.trim(), { ...fields, audio: audio || undefined }),
        hasAudio: attached,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const hostRejected = /missing text ciphertext|too large/i.test(message);
      if (!audio || !hostRejected) throw err;
      attached = false;
      await pushNote(token, {
        id: note.id,
        createdAt: note.createdAt,
        durationMs: note.durationMs,
        platform: 'phone',
        fileName: take?.title,
        ciphertext: await encryptNotePayload(key.trim(), fields),
        hasAudio: false,
      });
    }
    setNotes((prev) => [{ ...note, sent: true }, ...prev]);
    if (opts.takeId) markTake(opts.takeId, { sent: true, text: opts.text });
    setStatus(
      attached
        ? opts.recordOnly
          ? 'Sent. Import the audio in Voice notes to transcribe it.'
          : 'Sent. Audio is saved on the computer until you delete this take here or in the desktop inbox.'
        : audio
          ? 'Sent as text. The notes host could not store this audio file yet.'
          : 'Sent to your desktop inbox as text.',
    );
  };

  const sendTake = async (take: LibraryTake) => {
    const text = take.text.trim() || (take.recordOnly ? 'Voice only take. Import to transcribe.' : '');
    if (!text) {
      Alert.alert('Nothing to send', 'This take has no transcript yet. Record it again, or use Record only and send the audio.');
      return;
    }
    if (syncing) return;
    setSyncing(true);
    try {
      await sendNote({
        text,
        durationMs: take.durationMs,
        bookId: take.bookId ?? null,
        bookTitle: take.bookTitle ?? null,
        recordOnly: Boolean(take.recordOnly),
        takeId: take.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send that note.';
      setStatus(message);
      Alert.alert('Could not sync', message);
    } finally {
      setSyncing(false);
    }
  };

  const sendTakes = async (items: LibraryTake[]) => {
    const pending = items.filter((item) => !item.sent);
    if (!pending.length || syncing) return;
    setSyncing(true);
    setStatus(`Sending ${pending.length} take${pending.length === 1 ? '' : 's'}…`);
    try {
      for (const take of pending) {
        const text = take.text.trim() || (take.recordOnly ? 'Voice only take. Import to transcribe.' : '');
        if (!text) continue;
        await sendNote({
          text,
          durationMs: take.durationMs,
          bookId: take.bookId ?? null,
          bookTitle: take.bookTitle ?? null,
          recordOnly: Boolean(take.recordOnly),
          takeId: take.id,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send that note.';
      setStatus(message);
      Alert.alert('Could not sync', message);
    } finally {
      setSyncing(false);
    }
  };

  const deleteTakes = (ids: string[]) => {
    const sent = takes.filter((item) => ids.includes(item.id) && item.sent);
    void (async () => {
      if (token) {
        try {
          for (const take of sent) {
            await patchNoteStatus(token, take.id, 'deleted');
          }
        } catch (err) {
          Alert.alert(
            'Could not delete from the computer',
            err instanceof Error ? err.message : 'The desktop copy is still there. Try again with a network connection.',
          );
          return;
        }
      }
      setTakes((prev) => {
        void removeTakes(prev, ids);
        return prev.filter((item) => !ids.includes(item.id));
      });
      if (currentTakeId && ids.includes(currentTakeId)) setCurrentTakeId(null);
    })();
  };

  const teachPairs = async (take: LibraryTake, pairs: TaughtPair[]) => {
    const taught = pairs.filter((pair) => pair.word.trim());
    if (!taught.length) return;
    const next = await upsertSpeechCues(
      vocabRef.current,
      taught.map((pair) => ({
        word: pair.word.trim(),
        heard: pair.heard.trim() || undefined,
        takeId: take.id,
        audioUri: take.audioUri,
        startMs: pair.startMs,
        endMs: pair.endMs,
      })),
    );
    vocabRef.current = next;
    setVocab(next);
    const libraryBookId = take.bookId?.trim() || bookId?.trim() || '';
    const libraryBookTitle = take.bookTitle?.trim() || bookTitle?.trim() || '';
    if (!libraryBookId) {
      setStatus(
        taught.length === 1
          ? `Taught “${taught[0].word}” for the next take. Choose a book to add it to the names library.`
          : `Taught ${taught.length} words for the next take. Choose a book to add them to the names library.`,
      );
      return;
    }
    if (!token || !key.trim()) {
      setStatus(
        taught.length === 1
          ? `Taught “${taught[0].word}”. Link this phone to add it to the names library.`
          : `Taught ${taught.length} words. Link this phone to add them to the names library.`,
      );
      return;
    }
    try {
      for (const pair of taught) {
        const canonical = pair.word.trim();
        const heard = pair.heard.trim();
        const id = createNameNoteId(libraryBookId, canonical);
        await pushNote(token, {
          id,
          createdAt: new Date().toISOString(),
          durationMs: 0,
          platform: 'phone',
          fileName: `name\t${libraryBookId}\t${canonical}`.slice(0, 180),
          ciphertext: await encryptNotePayload(key.trim(), {
            kind: 'create-name',
            id,
            bookId: libraryBookId,
            bookHint: libraryBookTitle,
            canonical,
            aliases: heard && heard.toLowerCase() !== canonical.toLowerCase() ? [heard] : [],
            category: guessNameCategory(canonical),
          }),
        });
      }
      setStatus(
        taught.length === 1
          ? `Added “${taught[0].word}” to the names library. Refresh Voice notes on the computer if it is not there yet.`
          : `Added ${taught.length} names to the library. Refresh Voice notes on the computer if they are not there yet.`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Taught on this phone. Could not add it to the names library yet.');
    }
  };

  const shareTake = (take: LibraryTake) => {
    const kind = shareKindFor(take.audioUri, take.text);
    if (kind === 'none') return;
    const audio = async () => {
      if (!take.audioUri) return;
      setExporting(true);
      try {
        await shareAudioTake(take.audioUri);
      } catch (err) {
        if (!isShareDismissed(err)) setStatus(err instanceof Error ? err.message : 'Could not share that take.');
      } finally {
        setExporting(false);
      }
    };
    const transcript = async () => {
      if (!take.text.trim()) return;
      setExporting(true);
      try {
        await shareTranscriptTake(take.text, take.createdAt);
      } catch (err) {
        if (!isShareDismissed(err)) setStatus(err instanceof Error ? err.message : 'Could not share that take.');
      } finally {
        setExporting(false);
      }
    };
    if (kind === 'audio') {
      void audio();
      return;
    }
    if (kind === 'transcript') {
      void transcript();
      return;
    }
    Alert.alert('Share this take', 'The share sheet lists Messages, Mail, Files, and the rest of your apps.', [
      { text: 'Voice note', onPress: () => void audio() },
      { text: 'Transcript', onPress: () => void transcript() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveTakeToFiles = async (take: LibraryTake) => {
    setExporting(true);
    try {
      const uri = await exportTakeCopy(take);
      await shareLocalFile(uri, {
        mimeType: take.audioUri ? 'audio/mp4' : 'text/plain',
        UTI: take.audioUri ? 'public.mpeg-4-audio' : 'public.plain-text',
        dialogTitle: 'Save to Files',
      });
      markTake(take.id, { exported: true });
      setStatus('Copy sent to Files. The take is still in Library.');
    } catch (err) {
      if (!isShareDismissed(err)) setStatus(err instanceof Error ? err.message : 'Could not save a copy to Files.');
    } finally {
      setExporting(false);
    }
  };

  const sheetTake = bookTargetRef.current !== 'session'
    ? takes.find((item) => item.id === bookTargetRef.current)
    : null;
  const sheetBookId = sheetTake ? sheetTake.bookId ?? null : bookId;

  const ringProgress = recording ? (elapsedMs % 60_000) / 60_000 : 0;

  if (!ready) {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={styles.page} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      <Image source={require('./assets/mic.png')} fadeDuration={0} style={{ width: 1, height: 1, position: 'absolute', opacity: 0 }} />
      <ScreenKeyboardAvoid>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageInner}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        {...recordSwipe}
      >
        <View style={styles.brand}>
          <Image source={logo} style={styles.logo} />
          <View style={styles.brandCopy}>
            <Text style={styles.wordmark}>SpeakFiction</Text>
            <Text style={styles.tag}>Companion · Voice notes</Text>
          </View>
          <Pressable style={styles.btn} onPress={openLibrary} disabled={recording}>
            <Text style={styles.btnText}>Library</Text>
          </Pressable>
          <Pressable
            style={[styles.badge, linked ? styles.badgeOn : styles.badgeOff]}
            onPress={openLink}
            accessibilityRole="button"
            accessibilityLabel={keyLocked ? 'Show the saved SF- key' : 'Link this phone'}
          >
            <Text style={styles.badgeText}>{linked ? 'Linked' : 'Not linked'}</Text>
          </Pressable>
        </View>

        {compactStage ? (
          <View style={styles.stageCompact}>
            <Text style={styles.clock}>{formatClock(elapsedMs)}</Text>
          </View>
        ) : (
        <View style={styles.stage}>
          <Pressable
            style={styles.bookPick}
            onPress={() => {
              bookTargetRef.current = 'session';
              setBookOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Choose a book for this take"
          >
            <Text style={styles.bookPickLabel}>Book</Text>
            <Text style={styles.bookPickValue} numberOfLines={1}>
              {bookLabel(books, bookId, bookTitle)}
            </Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
          <Text style={styles.clock}>{formatClock(elapsedMs)}</Text>
          <Text style={styles.stageHint}>
            {recording ? 'Recording' : 'Tap to record · hold to talk'}
          </Text>
          <Pressable
            onPressIn={onMicIn}
            onPressOut={onMicOut}
            onPress={onMicPress}
            onTouchMove={onMicMove}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            style={styles.micHit}
          >
            <ProgressRing progress={recording ? Math.max(ringProgress, 0.02) : 0} color={colors.accent} track={colors.border} />
            <View style={styles.mic}>
              <MicIcon size={Math.round(MIC_SIZE * 0.6)} hidden={recording} />
              {recording ? <PauseIcon color={colors.onAccent} size={30} /> : null}
            </View>
          </Pressable>

          <View style={styles.toggle} accessibilityRole="tablist">
            <Pressable
              style={[styles.toggleBtn, !transcribeOnPhone && styles.toggleOn]}
              onPress={() => void persistTranscribe(false)}
              disabled={recording}
            >
              <Text style={[styles.toggleText, !transcribeOnPhone && styles.toggleTextOn]}>Record only</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, transcribeOnPhone && styles.toggleOn]}
              onPress={() => void persistTranscribe(true)}
              disabled={recording}
            >
              <Text style={[styles.toggleText, transcribeOnPhone && styles.toggleTextOn]}>Transcribe here</Text>
            </Pressable>
          </View>
          <Text style={styles.toggleHint}>
            {transcribeOnPhone
              ? 'Records an audio file and a transcript. Both stay linked in Library.'
              : 'This phone records audio. Your computer transcribes.'}
          </Text>
        </View>
        )}

        <View style={styles.dock}>
          {transcribeOnPhone ? (
            <>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                style={styles.area}
                placeholder="On-device text lands here."
                placeholderTextColor={colors.textFaint}
              />
              {draft.trim() || currentTakeId ? (
                <Text style={styles.toggleHint}>Open Library to send this take to the desktop inbox.</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.lead}>
              {elapsedMs > 0 && !recording
                ? `${formatClock(elapsedMs)} take is in Library. Open Library to play, send, share, or save a copy.`
                : 'Record a take. It stays in Library. Open Library to send it so the computer can transcribe.'}
            </Text>
          )}
          {keyLocked ? null : (
            <Pressable style={styles.btn} onPress={openLink}>
              <Text style={styles.btnText}>Scan or paste key</Text>
            </Pressable>
          )}

          <View style={styles.lookRow}>
            <View style={styles.seg}>
              <Pressable
                style={[styles.segBtn, mode === 'light' && styles.segOn]}
                onPress={() => void persistMode('light')}
              >
                <Text style={[styles.segText, mode === 'light' && styles.segTextOn]}>Light</Text>
              </Pressable>
              <Pressable
                style={[styles.segBtn, mode === 'dark' && styles.segOn]}
                onPress={() => void persistMode('dark')}
              >
                <Text style={[styles.segText, mode === 'dark' && styles.segTextOn]}>Dark</Text>
              </Pressable>
            </View>
            <Pressable style={styles.dropdown} onPress={() => setThemeOpen(true)}>
              <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
              <Text style={styles.dropdownText} numberOfLines={1}>
                {themeName}
              </Text>
              <Text style={styles.caret}>▾</Text>
            </Pressable>
          </View>

          <Text style={styles.status} numberOfLines={2}>
            {status}
            {notes.length ? ` · ${notes.length} sent` : ''}
          </Text>
        </View>
      </ScrollView>
      </ScreenKeyboardAvoid>

      {scanning ? (
        <View style={styles.scan} {...scanSwipe}>
          <ScreenKeyboardAvoid>
          <View style={styles.scanSafe}>
            <View style={styles.brand}>
              <Image source={logo} style={styles.logo} />
              <View style={styles.brandCopy}>
                <Text style={styles.wordmark}>SpeakFiction</Text>
                <Text style={styles.tag}>Scan the desktop QR</Text>
              </View>
              <Pressable style={styles.btn} onPress={goRecord}>
                <Text style={styles.btnText}>Record</Text>
              </Pressable>
            </View>
            <Text style={styles.lead}>
              {keyLocked
                ? 'This phone is linked. The SF- key stays saved and cannot be edited.'
                : 'Paste the SF- key, or point the camera at Voice notes on your computer.'}
            </Text>
            <TextInput
              value={key}
              onChangeText={keyLocked ? undefined : setKey}
              editable={!keyLocked}
              selectTextOnFocus={!keyLocked}
              showSoftInputOnFocus={!keyLocked}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              placeholder="SF-…"
              placeholderTextColor={colors.textFaint}
              style={[styles.input, keyLocked && styles.inputLocked]}
              accessibilityLabel="SpeakFiction license key"
              accessibilityState={{ disabled: keyLocked }}
            />
            {!cameraPerm?.granted ? (
              <Pressable style={styles.btnPrimary} onPress={() => void requestCamera()}>
                <Text style={styles.btnPrimaryText}>Allow camera</Text>
              </Pressable>
            ) : (
              <CameraView
                style={styles.camera}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (scannedRef.current) return;
                  const parsed = parseCompanionPairing(data);
                  if (!parsed) {
                    setStatus('That code is not a SpeakFiction link. Scan the QR in Voice notes.');
                    return;
                  }
                  scannedRef.current = true;
                  setScanning(false);
                  confirmLink(parsed);
                }}
              />
            )}
            <Pressable style={styles.btn} onPress={goRecord}>
              <Text style={styles.btnText}>Record</Text>
            </Pressable>
          </View>
          </ScreenKeyboardAvoid>
        </View>
      ) : null}

      {screen === 'library' ? (
        <LibraryScreen
          takes={takes}
          books={books}
          colors={colors}
          styles={styles}
          taughtWords={taughtWords}
          syncing={syncing}
          onClose={goRecord}
          onRename={(id, title) => markTake(id, { title })}
          onPickBook={(take) => {
            bookTargetRef.current = take.id;
            setBookOpen(true);
          }}
          onSend={(take) => void sendTake(take)}
          onSendMany={(items) => void sendTakes(items)}
          onShare={shareTake}
          onSaveToFiles={(take) => void saveTakeToFiles(take)}
          onDelete={deleteTakes}
          onChangeWords={(id, words, text) => markTake(id, { words, text, sent: false })}
          onTeachPairs={(take, pairs) => void teachPairs(take, pairs)}
        />
      ) : null}

      <Modal visible={themeOpen} transparent animationType="fade" onRequestClose={goRecord}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setThemeOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Palette</Text>
              <Pressable style={styles.btn} onPress={goRecord}>
                <Text style={styles.btnText}>Record</Text>
              </Pressable>
            </View>
            {THEME_LIST.map((item) => {
              const on = themeId === item.id;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.sheetRow, on && { backgroundColor: `${item.accent}22` }]}
                  onPress={() => void persistTheme(item.id)}
                >
                  <View style={[styles.swatch, { backgroundColor: item.accent }]} />
                  <Text style={[styles.sheetRowText, on && { color: colors.text }]}>{item.name}</Text>
                  {on ? <Text style={styles.sheetCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={bookOpen} transparent animationType="fade" onRequestClose={goRecord}>
        <ScreenKeyboardAvoid>
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.sheetDismiss} onPress={() => setBookOpen(false)} />
          <View style={[styles.sheet, styles.sheetKeyboard]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Book</Text>
              <Pressable style={styles.btn} onPress={goRecord}>
                <Text style={styles.btnText}>Record</Text>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <Pressable
              style={[styles.sheetRow, !sheetBookId && { backgroundColor: `${colors.accent}22` }]}
              onPress={() => void persistBook(null, null)}
            >
              <Text style={[styles.sheetRowText, !sheetBookId && { color: colors.text }]}>None</Text>
              {!sheetBookId ? <Text style={styles.sheetCheck}>✓</Text> : null}
            </Pressable>
              {books.map((item) => {
                const on = sheetBookId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.sheetRow, on && { backgroundColor: `${colors.accent}22` }]}
                    onPress={() => void persistBook(item.id, item.title)}
                  >
                    <Text style={[styles.sheetRowText, on && { color: colors.text }]}>{item.title}</Text>
                    {on ? <Text style={styles.sheetCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            <Text style={styles.sheetTitle}>New book</Text>
            <TextInput
              value={newBookTitle}
              onChangeText={setNewBookTitle}
              placeholder="Title"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
            <ScrollView horizontal style={styles.genreRow} contentContainerStyle={styles.genreRowInner}>
              {BOOK_GENRES.map((item) => {
                const on = newBookGenre === item.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.genreChip, on && styles.genreChipOn]}
                    onPress={() => setNewBookGenre(item.id)}
                  >
                    <Text style={[styles.genreChipText, on && styles.genreChipTextOn]}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={[styles.btnPrimary, !newBookTitle.trim() && styles.btnDisabled]}
              onPress={() => void addBook()}
              disabled={!newBookTitle.trim()}
            >
              <Text style={styles.btnPrimaryText}>Add book</Text>
            </Pressable>
            </ScrollView>
          </View>
        </View>
        </ScreenKeyboardAvoid>
      </Modal>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    page: { flex: 1, paddingHorizontal: 20, paddingTop: TOP_INSET, paddingBottom: 12 },
    pageInner: { flexGrow: 1 },
    stageCompact: { alignItems: 'center', paddingVertical: 8 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 36, height: 36, borderRadius: 8 },
    brandCopy: { flex: 1 },
    wordmark: { color: c.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
    tag: { color: c.textDim, fontSize: 12, marginTop: 1 },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    badgeOn: { backgroundColor: `${c.good}22` },
    badgeOff: { backgroundColor: c.bgElev2 },
    badgeText: { color: c.text, fontSize: 12, fontWeight: '600' },
    stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
    bookPick: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      maxWidth: 340,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgInput,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    bookPickLabel: { color: c.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
    bookPickValue: { flex: 1, color: c.text, fontWeight: '600', fontSize: 15, textAlign: 'right' },
    bookList: { maxHeight: 220 },
    genreRow: { maxHeight: 44 },
    genreRowInner: { gap: 8, paddingVertical: 4 },
    genreChip: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgInput,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    genreChipOn: { backgroundColor: c.accent, borderColor: c.accent },
    genreChipText: { color: c.textDim, fontSize: 12, fontWeight: '600' },
    genreChipTextOn: { color: c.onAccent },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetDismiss: { flex: 1 },
    libList: { flex: 1, marginTop: 12 },
    libCard: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgElev,
      borderRadius: 12,
      padding: 12,
      gap: 4,
      marginBottom: 8,
    },
    libTitle: { color: c.text, fontSize: 17, fontWeight: '700' },
    libMeta: { color: c.textDim, fontSize: 12, marginTop: 2 },
    libPreview: { color: c.textDim, fontSize: 14, lineHeight: 20, marginTop: 6 },
    clock: {
      color: c.text,
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: 1,
      fontVariant: ['tabular-nums'],
    },
    stageHint: { color: c.textFaint, fontSize: 13, marginBottom: 4 },
    micHit: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mic: {
      width: MIC_SIZE,
      height: MIC_SIZE,
      borderRadius: MIC_SIZE / 2,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.accent,
      shadowOpacity: 0.4,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    toggle: {
      flexDirection: 'row',
      backgroundColor: c.bgInput,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      padding: 3,
      width: '100%',
      maxWidth: 340,
      marginTop: 8,
    },
    toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center' },
    toggleOn: { backgroundColor: c.accent },
    toggleText: { color: c.textDim, fontWeight: '600', fontSize: 13 },
    toggleTextOn: { color: c.onAccent },
    toggleHint: { color: c.textFaint, fontSize: 12, textAlign: 'center', maxWidth: 280 },
    dock: { gap: 8 },
    lead: { color: c.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      color: c.text,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: c.bgInput,
      fontSize: 15,
    },
    inputLocked: {
      color: c.textDim,
      backgroundColor: c.bgElev2,
    },
    inputGrow: { flex: 1 },
    btnFlex: { flex: 1 },
    area: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      color: c.text,
      padding: 10,
      backgroundColor: c.bgInput,
      minHeight: 56,
      maxHeight: 72,
      textAlignVertical: 'top',
      fontSize: 15,
      lineHeight: 20,
    },
    status: { color: c.textDim, fontSize: 12, lineHeight: 16, textAlign: 'center' },
    linkRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    lookRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    btn: {
      backgroundColor: c.bgElev2,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    btnPrimary: {
      backgroundColor: c.accent,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    btnDisabled: { opacity: 0.45 },
    btnText: { color: c.text, fontWeight: '600', fontSize: 14 },
    btnPrimaryText: { color: c.onAccent, fontWeight: '700', fontSize: 15 },
    seg: {
      flexDirection: 'row',
      backgroundColor: c.bgInput,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 3,
      flex: 1,
    },
    segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
    segOn: { backgroundColor: c.bgElev2 },
    segText: { color: c.textDim, fontWeight: '600', fontSize: 13 },
    segTextOn: { color: c.text },
    dropdown: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgInput,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    dropdownText: { flex: 1, color: c.text, fontWeight: '600', fontSize: 13 },
    caret: { color: c.textFaint, fontSize: 14 },
    swatch: { width: 10, height: 10, borderRadius: 5 },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: '#00000066',
      justifyContent: 'flex-end',
      padding: 16,
    },
    sheet: {
      backgroundColor: c.bgElev,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 10,
      gap: 2,
    },
    sheetKeyboard: { maxHeight: '88%', flexGrow: 0 },
    sheetTitle: {
      color: c.textFaint,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    sheetRowText: { flex: 1, color: c.text, fontSize: 16, fontWeight: '600' },
    sheetCheck: { color: c.accent, fontWeight: '700' },
    scan: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.bg,
      paddingHorizontal: 20,
      paddingTop: TOP_INSET,
      paddingBottom: 20,
    },
    scanSafe: { flex: 1, gap: 12 },
    camera: { flex: 1, borderRadius: 16, overflow: 'hidden', minHeight: 280 },
  });
}
