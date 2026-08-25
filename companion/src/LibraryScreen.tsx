import { useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { bookLabel, type CompanionBook } from './books';
import { ScreenKeyboardAvoid } from './keyboardAvoid';
import { useHorizontalSwipe } from './pageSwipe';
import { SyncDot, TakePlayer } from './TakePlayer';
import { defaultTakeTitle, type LibraryTake } from './takeLibrary';
import type { TaughtPair } from './speechVocab';
import type { ThemeColors } from './theme';
import type { WordCue } from './wordCues';

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function LibraryRow({
  item,
  books,
  colors,
  styles,
  selecting,
  selected,
  onOpen,
  onToggle,
  onRename,
  onDelete,
}: {
  item: LibraryTake;
  books: CompanionBook[];
  colors: ThemeColors;
  styles: Record<string, object>;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const dxRef = useRef(0);
  const openRef = useRef(false);
  const selectingRef = useRef(selecting);
  const editingRef = useRef(editing);
  const deleteRef = useRef(onDelete);
  selectingRef.current = selecting;
  editingRef.current = editing;
  deleteRef.current = onDelete;
  const snap = (next: number) => {
    dxRef.current = next;
    openRef.current = next < -40;
    setDx(next);
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, gesture) => {
          if (selectingRef.current || editingRef.current) return false;
          return gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
        },
        onMoveShouldSetPanResponderCapture: (_e, gesture) => {
          if (selectingRef.current || editingRef.current) return false;
          return gesture.dx < -12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.1;
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderMove: (_e, gesture) => {
          const origin = openRef.current ? -88 : 0;
          snap(Math.max(-96, Math.min(0, origin + gesture.dx)));
        },
        onPanResponderRelease: (_e, gesture) => {
          if (gesture.dx < -110 || gesture.vx < -1.1) {
            snap(0);
            deleteRef.current();
            return;
          }
          snap(dxRef.current < -48 || gesture.dx < -48 ? -88 : 0);
        },
        onPanResponderTerminate: () => snap(openRef.current ? -88 : 0),
      }),
    [],
  );

  const book = item.bookTitle || (item.bookId ? bookLabel(books, item.bookId) : '');

  return (
    <View style={{ marginBottom: 8, overflow: 'hidden', borderRadius: 12 }}>
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 88,
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Pressable
          onPress={onDelete}
          accessibilityLabel="Delete take"
          style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
        </Pressable>
      </View>
      <View style={{ transform: [{ translateX: dx }] }} {...pan.panHandlers}>
        <Pressable
          style={styles.libCard}
          onPress={() => {
            if (openRef.current) {
              snap(0);
              return;
            }
            if (selecting) onToggle();
            else if (!editing) onOpen();
          }}
          onLongPress={() => {
            if (selecting) return;
            setTitle(item.title);
            setEditing(true);
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selecting ? (
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent : colors.border,
                  backgroundColor: selected ? colors.accent : 'transparent',
                }}
              />
            ) : (
              <SyncDot sent={item.sent} />
            )}
            {editing ? (
              <TextInput
                value={title}
                onChangeText={setTitle}
                autoFocus
                style={[styles.input, { flex: 1, paddingVertical: 6 }]}
                onBlur={() => {
                  const next = title.trim() || defaultTakeTitle(item.createdAt);
                  onRename(next);
                  setEditing(false);
                }}
                onSubmitEditing={() => {
                  const next = title.trim() || defaultTakeTitle(item.createdAt);
                  onRename(next);
                  setEditing(false);
                }}
              />
            ) : (
              <Text style={[styles.libTitle, { flex: 1 }]}>{item.title}</Text>
            )}
          </View>
          <Text style={styles.libMeta}>
            {formatClock(item.durationMs)}
            {book ? ` · ${book}` : ''}
            {item.sent ? ' · Synced' : ' · Not synced'}
          </Text>
          {item.text.trim() ? (
            <Text style={styles.libPreview} numberOfLines={2}>
              {item.text.trim()}
            </Text>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

export function LibraryScreen({
  takes,
  books,
  colors,
  styles,
  taughtWords,
  onClose,
  onRename,
  onPickBook,
  onSend,
  onSendMany,
  onShare,
  onSaveToFiles,
  onDelete,
  onChangeWords,
  onTeachPairs,
  syncing,
}: {
  takes: LibraryTake[];
  books: CompanionBook[];
  colors: ThemeColors;
  styles: Record<string, object>;
  taughtWords?: Set<string>;
  syncing?: boolean;
  onClose: () => void;
  onRename: (id: string, title: string) => void;
  onPickBook: (take: LibraryTake) => void;
  onSend: (take: LibraryTake) => void;
  onSendMany: (takes: LibraryTake[]) => void;
  onShare: (take: LibraryTake) => void;
  onSaveToFiles: (take: LibraryTake) => void;
  onDelete: (ids: string[]) => void;
  onChangeWords: (id: string, words: WordCue[], text: string) => void;
  onTeachPairs: (take: LibraryTake, pairs: TaughtPair[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const take = takes.find((item) => item.id === openId) ?? null;
  const swipe = useHorizontalSwipe({
    onSwipeRight: () => {
      if (take) setOpenId(null);
      else onClose();
    },
    enabled: !scrubbing && !selecting,
    capture: Boolean(take),
    axis: 'right',
  });
  const picked = takes.filter((item) => selected.includes(item.id));
  const unsynced = takes.filter((item) => !item.sent);

  const confirmDelete = (ids: string[]) => {
    if (!ids.length) return;
    const synced = takes.filter((item) => ids.includes(item.id) && item.sent).length;
    const many = ids.length > 1;
    const message = synced
      ? many
        ? `${ids.length} takes will be removed from this phone and from the desktop inbox, including any audio saved on the computer.`
        : 'This take will be removed from this phone and from the desktop inbox, including any audio saved on the computer.'
      : many
        ? `${ids.length} takes will be removed from this phone.`
        : 'This take will be removed from this phone.';
    Alert.alert(many ? 'Delete these takes?' : 'Delete this take?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete(ids);
          setSelected((prev) => (many ? [] : prev.filter((id) => !ids.includes(id))));
          if (many) setSelecting(false);
          if (openId && ids.includes(openId)) setOpenId(null);
        },
      },
    ]);
  };

  if (take) {
    const canExport = Boolean(take.audioUri || take.text.trim());
    return (
      <View style={styles.scan} {...swipe}>
        <ScreenKeyboardAvoid>
        <View style={styles.brand}>
          <View style={styles.brandCopy}>
            <Text style={styles.wordmark}>Take</Text>
            <Text style={styles.tag}>Stays in the app unless you save a copy to Files</Text>
          </View>
          <View style={[styles.linkRow, { gap: 12 }]}>
            <Pressable style={[styles.btn, { paddingHorizontal: 14, paddingVertical: 12 }]} onPress={() => setOpenId(null)}>
              <Text style={styles.btnText}>Library</Text>
            </Pressable>
            <Pressable style={[styles.btn, { paddingHorizontal: 14, paddingVertical: 12 }]} onPress={onClose}>
              <Text style={styles.btnText}>Record</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView
          style={styles.libList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingBottom: 32, gap: 16 }}
        >
          <TextInput
            value={take.title}
            onChangeText={(title) => onRename(take.id, title)}
            style={styles.input}
            placeholder={defaultTakeTitle(take.createdAt)}
            placeholderTextColor={colors.textFaint}
          />
          <Text style={styles.libMeta}>
            {formatClock(take.durationMs)}
            {take.recordOnly ? ' · Record only' : take.text.trim() ? ' · Transcript' : ''}
          </Text>
          <Pressable style={styles.bookPick} onPress={() => onPickBook(take)}>
            <Text style={styles.bookPickLabel}>Book</Text>
            <Text style={styles.bookPickValue} numberOfLines={1}>
              {bookLabel(books, take.bookId ?? null, take.bookTitle)}
            </Text>
            <Text style={styles.caret}>▾</Text>
          </Pressable>
          <TakePlayer
            take={take}
            colors={colors}
            styles={styles}
            taughtWords={taughtWords}
            onScrubbingChange={setScrubbing}
            onDelete={() => confirmDelete([take.id])}
            onChangeWords={(words, text) => onChangeWords(take.id, words, text)}
            onTeachPairs={(pairs) => onTeachPairs(take, pairs)}
          />
          <Pressable
            style={[styles.btnPrimary, { paddingVertical: 14 }, (take.sent || syncing) && styles.btnDisabled]}
            onPress={() => onSend(take)}
            disabled={take.sent || syncing}
          >
            <Text style={styles.btnPrimaryText}>
              {take.sent ? 'Already synced' : syncing ? 'Sending…' : 'Send to desktop inbox'}
            </Text>
          </Pressable>
          <View style={[styles.linkRow, { gap: 12 }]}>
            <Pressable
              style={[styles.btn, styles.btnFlex, { paddingVertical: 12 }, !canExport && styles.btnDisabled]}
              onPress={() => onShare(take)}
              disabled={!canExport}
            >
              <Text style={styles.btnText}>Share</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnFlex, { paddingVertical: 12 }, !canExport && styles.btnDisabled]}
              onPress={() => onSaveToFiles(take)}
              disabled={!canExport}
            >
              <Text style={styles.btnText}>Save to Files</Text>
            </Pressable>
          </View>
        </ScrollView>
        </ScreenKeyboardAvoid>
      </View>
    );
  }

  return (
    <View style={styles.scan} {...swipe}>
      <ScreenKeyboardAvoid>
      <View style={styles.brand}>
        <View style={styles.brandCopy}>
          <Text style={styles.wordmark}>Library</Text>
          <Text style={styles.tag}>
            {takes.length ? `${takes.length} take${takes.length === 1 ? '' : 's'} on this phone` : 'Takes stay in this app'}
          </Text>
        </View>
        <Pressable
          style={styles.btn}
          onPress={() => {
            setSelecting((on) => !on);
            setSelected([]);
          }}
        >
          <Text style={styles.btnText}>{selecting ? 'Done' : 'Select'}</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={onClose}>
          <Text style={styles.btnText}>Record</Text>
        </Pressable>
      </View>
      {takes.length > 0 ? (
        <View style={styles.linkRow}>
          <Pressable
            style={[styles.btnPrimary, styles.btnFlex, (syncing || (selecting ? !picked.length : !unsynced.length)) && styles.btnDisabled]}
            onPress={() => onSendMany(selecting ? picked : unsynced)}
            disabled={syncing || (selecting ? picked.length === 0 : unsynced.length === 0)}
          >
            <Text style={styles.btnPrimaryText}>
              {syncing
                ? 'Sending…'
                : selecting
                  ? `Sync ${picked.length || ''}`.trim()
                  : `Sync all${unsynced.length ? ` (${unsynced.length})` : ''}`}
            </Text>
          </Pressable>
          {selecting ? (
            <Pressable
              style={[styles.btn, !picked.length && styles.btnDisabled]}
              onPress={() => confirmDelete(selected)}
              disabled={!picked.length}
            >
              <Text style={styles.btnText}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {takes.length === 0 ? (
        <Text style={styles.lead}>No takes yet. Record one and it will land here.</Text>
      ) : (
        <ScrollView
          style={styles.libList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {takes.map((item) => (
            <LibraryRow
              key={item.id}
              item={item}
              books={books}
              colors={colors}
              styles={styles}
              selecting={selecting}
              selected={selected.includes(item.id)}
              onOpen={() => setOpenId(item.id)}
              onToggle={() =>
                setSelected((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))
              }
              onRename={(title) => onRename(item.id, title)}
              onDelete={() => confirmDelete([item.id])}
            />
          ))}
        </ScrollView>
      )}
      </ScreenKeyboardAvoid>
    </View>
  );
}
