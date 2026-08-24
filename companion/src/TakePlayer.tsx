import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { TrashIcon } from './MicIcon';
import { applyVocab, correctionsFromEdit, type TaughtPair } from './speechVocab';
import type { ThemeColors } from './theme';
import type { LibraryTake } from './takeLibrary';
import { activeWordIndex, peaksForTake, replaceWordAt, textFromWords, wordsForTake, type WordCue } from './wordCues';

const SKIP_MS = 10_000;
const WAVE_BARS = 72;
export const SYNC_PENDING = '#8b5cf6';

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SyncDot({ sent, size = 9 }: { sent?: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: sent ? '#34d399' : SYNC_PENDING,
      }}
    />
  );
}

export function TakePlayer({
  take,
  colors,
  styles,
  taughtWords,
  onScrubbingChange,
  onDelete,
  onChangeWords,
  onTeachPairs,
}: {
  take: LibraryTake;
  colors: ThemeColors;
  styles: Record<string, object>;
  taughtWords?: Set<string>;
  onScrubbingChange?: (active: boolean) => void;
  onDelete?: () => void;
  onChangeWords?: (words: WordCue[], text: string) => void;
  onTeachPairs?: (pairs: TaughtPair[]) => void;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const soundGen = useRef(0);
  const startedPlay = useRef(false);
  const seeking = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(take.durationMs);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingAll, setEditingAll] = useState(() => !take.text.trim());
  const [textDraft, setTextDraft] = useState(take.text);
  const words = useMemo(
    () => wordsForTake(take.text, durationMs || take.durationMs, take.words),
    [take.text, take.words, durationMs, take.durationMs],
  );
  const peaks = useMemo(() => peaksForTake(take.id, take.peaks), [take.id, take.peaks]);
  const spoken = activeWordIndex(words, positionMs);
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  useEffect(() => {
    return () => {
      soundGen.current += 1;
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    soundGen.current += 1;
    startedPlay.current = false;
    void soundRef.current?.unloadAsync();
    soundRef.current = null;
    setPlaying(false);
    setPositionMs(0);
    setDurationMs(take.durationMs);
    setEditIndex(null);
    setEditingAll(!take.text.trim());
    setTextDraft(take.text);
  }, [take.id, take.audioUri, take.durationMs]);

  const ensureSound = async () => {
    if (soundRef.current) return soundRef.current;
    if (!take.audioUri) return null;
    const gen = ++soundGen.current;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
    const sound = new Audio.Sound();
    await sound.loadAsync(
      { uri: take.audioUri },
      { progressUpdateIntervalMillis: 80, shouldPlay: false, isLooping: false, positionMillis: 0, volume: 1 },
    );
    if (gen !== soundGen.current) {
      await sound.unloadAsync();
      return null;
    }
    sound.setOnPlaybackStatusUpdate((status) => {
      if (gen !== soundGen.current || !status.isLoaded) return;
      if (typeof status.durationMillis === 'number' && status.durationMillis > 0) {
        setDurationMs(status.durationMillis);
      }
      if (status.didJustFinish) {
        if (!startedPlay.current) return;
        setPlaying(false);
        setPositionMs(0);
        void sound.setPositionAsync(0);
        return;
      }
      if (!seeking.current && typeof status.positionMillis === 'number') {
        setPositionMs(status.positionMillis);
      }
      setPlaying(Boolean(status.isPlaying));
    });
    await sound.setPositionAsync(0);
    soundRef.current = sound;
    setPositionMs(0);
    return sound;
  };

  const seekTo = async (ms: number, resume = playing) => {
    const cap = durationMs || take.durationMs;
    const next = Math.max(0, Math.min(cap, ms));
    setPositionMs(next);
    const sound = await ensureSound();
    if (!sound) return;
    await sound.setPositionAsync(next);
    if (resume) {
      startedPlay.current = true;
      await sound.playAsync();
      setPlaying(true);
    }
  };

  const togglePlay = async () => {
    if (!take.audioUri) return;
    const sound = await ensureSound();
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await sound.pauseAsync();
      setPlaying(false);
      return;
    }
    const dur = status.durationMillis || durationMs || take.durationMs;
    const pos = status.positionMillis ?? 0;
    const atEnd = dur > 0 && pos >= dur - 160;
    startedPlay.current = true;
    const from = atEnd ? 0 : pos;
    setPositionMs(from);
    await sound.playFromPositionAsync(from);
    setPlaying(true);
  };

  const waveWidth = useRef(1);
  const seekRef = useRef(seekTo);
  const playingRef = useRef(playing);
  const durationRef = useRef(durationMs || take.durationMs);
  const scrubRef = useRef(onScrubbingChange);
  seekRef.current = seekTo;
  playingRef.current = playing;
  durationRef.current = durationMs || take.durationMs;
  scrubRef.current = onScrubbingChange;
  const setScrubbing = (active: boolean) => {
    seeking.current = active;
    scrubRef.current?.(active);
  };
  const waveSeek = (x: number) => {
    const width = waveWidth.current || 1;
    void seekRef.current(durationRef.current * Math.min(1, Math.max(0, x / width)), playingRef.current);
  };
  const wavePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (event) => {
          setScrubbing(true);
          waveSeek(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          waveSeek(event.nativeEvent.locationX);
        },
        onPanResponderRelease: (event) => {
          waveSeek(event.nativeEvent.locationX);
          setScrubbing(false);
        },
        onPanResponderTerminate: () => {
          setScrubbing(false);
        },
      }),
    [],
  );

  const saveEdit = () => {
    if (editIndex == null) return;
    const cue = words[editIndex];
    const heard = cue?.word || '';
    const nextWord = editValue.trim();
    if (!nextWord || !cue) {
      setEditIndex(null);
      setEditValue('');
      return;
    }
    let nextWords = replaceWordAt(words, editIndex, nextWord);
    let nextText = textFromWords(nextWords);
    const pairs: TaughtPair[] = correctionsFromEdit(heard, nextWord);
    if (!pairs.length) pairs.push({ heard, word: nextWord, startMs: cue.startMs, endMs: cue.endMs });
    nextText = applyVocab(
      nextText,
      pairs
        .filter((pair) => pair.heard.trim() && pair.heard.toLowerCase() !== pair.word.toLowerCase())
        .map((pair) => ({ word: pair.word, heard: pair.heard })),
    );
    nextWords = wordsForTake(nextText, durationMs || take.durationMs, nextWords);
    onTeachPairs?.(
      pairs.map((pair) => ({
        ...pair,
        startMs: pair.startMs ?? cue.startMs,
        endMs: pair.endMs ?? cue.endMs,
      })),
    );
    onChangeWords?.(nextWords, nextText);
    setEditIndex(null);
    setEditValue('');
  };

  const commitTranscript = () => {
    const nextText = textDraft.replace(/\s+$/g, '');
    const previous = take.text;
    if (nextText === previous) {
      setEditingAll(!nextText.trim());
      return;
    }
    const nextWords = wordsForTake(nextText, durationMs || take.durationMs, take.words);
    onChangeWords?.(nextWords, nextText);
    const pairs = correctionsFromEdit(previous, nextText);
    if (pairs.length) onTeachPairs?.(pairs);
    setEditingAll(!nextText.trim());
  };

  const syncRow = (
    <View style={playerStyles.syncRow}>
      <SyncDot sent={take.sent} />
      <Text style={{ color: colors.textDim, fontSize: 13, fontWeight: '600', flex: 1 }}>
        {take.sent ? 'Synced to desktop' : 'Not synced'}
      </Text>
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          accessibilityLabel="Delete this take"
          style={[styles.btn, playerStyles.trashBtn]}
        >
          <TrashIcon color={colors.danger} size={20} />
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 14 }}>Delete</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const transcriptBox = (
    <View style={[playerStyles.box, { borderColor: colors.border, backgroundColor: colors.bgInput }]}>
      {editingAll ? (
        <TextInput
          value={textDraft}
          onChangeText={setTextDraft}
          multiline
          autoFocus={Boolean(take.text.trim())}
          scrollEnabled
          textAlignVertical="top"
          placeholder="Type the transcript, or fix what the phone heard."
          placeholderTextColor={colors.textFaint}
          style={{
            minHeight: 88,
            maxHeight: 180,
            color: colors.text,
            fontSize: 16,
            lineHeight: 24,
            padding: 0,
          }}
          onEndEditing={commitTranscript}
        />
      ) : words.length ? (
        <ScrollView style={playerStyles.transcript}>
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 28 }}>
            {words.map((cue, index) => {
              const current = index === spoken && (playing || positionMs > 0);
              const upcoming = index > spoken;
              const taught = cue.cued === true || taughtWords?.has(cue.word.toLowerCase());
              return (
                <Text
                  key={`${cue.startMs}-${index}`}
                  onPress={() => take.audioUri && void seekTo(cue.startMs, true)}
                  onLongPress={() => {
                    setEditIndex(index);
                    setEditValue(cue.word);
                  }}
                  style={{
                    color: current ? colors.onAccent : upcoming ? colors.textFaint : colors.text,
                    backgroundColor: current ? colors.accent : 'transparent',
                    fontWeight: current ? '700' : '500',
                    textDecorationLine: taught ? 'underline' : 'none',
                    textDecorationColor: colors.accent2,
                  }}
                >
                  {cue.word}
                  {index < words.length - 1 ? ' ' : ''}
                </Text>
              );
            })}
          </Text>
        </ScrollView>
      ) : (
        <Text style={{ color: colors.textFaint, fontSize: 14, lineHeight: 20 }}>
          {take.recordOnly
            ? 'No transcript on this take yet. Edit it here, or send it so the computer can transcribe.'
            : 'No transcript on this take. Edit it here to add one.'}
        </Text>
      )}
      {editIndex != null && !editingAll ? (
        <View style={playerStyles.editRow}>
          <TextInput
            value={editValue}
            onChangeText={setEditValue}
            autoFocus
            scrollEnabled={false}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              color: colors.text,
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: colors.bg,
            }}
          />
          <Pressable style={styles.btn} onPress={() => { setEditIndex(null); setEditValue(''); }}>
            <Text style={styles.btnText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.btnPrimary} onPress={saveEdit}>
            <Text style={styles.btnPrimaryText}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={playerStyles.editRow}>
          {editingAll ? (
            <>
              {take.text.trim() ? (
                <Pressable
                  style={styles.btn}
                  onPress={() => {
                    setTextDraft(take.text);
                    setEditingAll(false);
                  }}
                >
                  <Text style={styles.btnText}>Cancel</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.btnPrimary, playerStyles.play]} onPress={commitTranscript}>
                <Text style={styles.btnPrimaryText}>Save</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={styles.btn}
              onPress={() => {
                setEditIndex(null);
                setTextDraft(take.text);
                setEditingAll(true);
              }}
            >
              <Text style={styles.btnText}>Edit transcript</Text>
            </Pressable>
          )}
        </View>
      )}
      <Text style={{ color: colors.textFaint, fontSize: 11, marginTop: 8 }}>
        {editingAll
          ? 'Save writes the transcript and adds corrected names to the library.'
          : take.audioUri
            ? 'Tap a word to play from there. Hold a word to fix it, or edit the transcript. Corrected names are taught and added to the book library.'
            : 'Edit the transcript. Corrected names are taught and added to the book library.'}
      </Text>
    </View>
  );

  if (!take.audioUri) {
    return (
      <View style={playerStyles.wrap}>
        {syncRow}
        {transcriptBox}
      </View>
    );
  }

  return (
    <View style={playerStyles.wrap}>
      {syncRow}
      <View
        style={playerStyles.seek}
        onLayout={(event) => {
          waveWidth.current = event.nativeEvent.layout.width;
        }}
        {...wavePan.panHandlers}
      >
        <View style={playerStyles.waveHit} pointerEvents="none">
          {peaks.slice(0, WAVE_BARS).map((peak, index) => {
            const on = index / Math.max(1, WAVE_BARS - 1) <= progress;
            return (
              <View
                key={index}
                style={[
                  playerStyles.bar,
                  {
                    height: 8 + peak * 44,
                    backgroundColor: on ? colors.accent : colors.border,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={playerStyles.times} pointerEvents="none">
          <Text style={{ color: colors.textDim, fontVariant: ['tabular-nums'], fontSize: 12 }}>{formatClock(positionMs)}</Text>
          <View style={[playerStyles.track, { backgroundColor: colors.border }]}>
            <View style={[playerStyles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.accent }]} />
          </View>
          <Text style={{ color: colors.textDim, fontVariant: ['tabular-nums'], fontSize: 12 }}>
            {formatClock(durationMs || take.durationMs)}
          </Text>
        </View>
      </View>

      <View style={playerStyles.controls}>
        <Pressable style={styles.btn} onPress={() => void seekTo(0, playing)} accessibilityLabel="Start over">
          <Text style={styles.btnText}>Start</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void seekTo(positionMs - SKIP_MS)} accessibilityLabel="Skip back 10 seconds">
          <Text style={styles.btnText}>−10</Text>
        </Pressable>
        <Pressable
          style={[styles.btnPrimary, playerStyles.play]}
          onPress={() => void togglePlay()}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <Text style={styles.btnPrimaryText}>{playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void seekTo(positionMs + SKIP_MS)} accessibilityLabel="Skip forward 10 seconds">
          <Text style={styles.btnText}>+10</Text>
        </Pressable>
      </View>

      {transcriptBox}
    </View>
  );
}

const playerStyles = {
  wrap: { gap: 12, marginTop: 12 },
  syncRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  trashBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  seek: { gap: 10 },
  waveHit: {
    height: 64,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
  },
  bar: { flex: 1, borderRadius: 2, minWidth: 2 },
  times: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#262d3d55', overflow: 'hidden' as const },
  fill: { height: 4, borderRadius: 2 },
  controls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  play: { flex: 1, paddingVertical: 12 },
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 88,
    maxHeight: 320,
  },
  transcript: { maxHeight: 176 },
  editRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 10 },
};
