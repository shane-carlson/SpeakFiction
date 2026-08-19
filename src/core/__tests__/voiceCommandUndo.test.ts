import { afterEach, describe, expect, it } from 'vitest';
import { joinDraft, strikeLastSentence } from '../dictationDraft';
import { parseVoiceCommand } from '../voiceCommands';
import {
  cloneDraft,
  popVoiceCommandSnapshot,
  pushVoiceCommandSnapshot,
} from '../voiceCommandUndo';
import { useStore } from '../../store';

describe('voice command undo stack', () => {
  it('keeps a few snapshots and pops the latest', () => {
    const a = { draft: cloneDraft([{ text: 'one', struck: false }]), blocks: [] };
    const b = { draft: cloneDraft([{ text: 'two', struck: false }]), blocks: [] };
    const stacked = pushVoiceCommandSnapshot(pushVoiceCommandSnapshot([], a), b);
    const first = popVoiceCommandSnapshot(stacked);
    expect(first.snap?.draft[0]?.text).toBe('two');
    const second = popVoiceCommandSnapshot(first.stack);
    expect(second.snap?.draft[0]?.text).toBe('one');
    expect(popVoiceCommandSnapshot(second.stack).snap).toBeNull();
  });
});

describe('undo last voice command', () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length) {
      const id = created.pop();
      if (id) useStore.getState().deleteBook(id);
    }
  });

  it('restores the draft after strike last sentence', () => {
    const bookId = useStore.getState().createBook('Undo command test', 'fantasy');
    created.push(bookId);

    const spoken = joinDraft([], 'the wind howled period');
    useStore.getState().setDictationDraft(bookId, spoken);
    useStore.getState().captureVoiceCommand(bookId);
    useStore.getState().setDictationDraft(bookId, strikeLastSentence(spoken));

    expect(useStore.getState().dictationDrafts[bookId]?.some((s) => s.struck)).toBe(true);

    const parsed = parseVoiceCommand('undo last command');
    expect(parsed.command).toBe('undoLastCommand');
    expect(useStore.getState().undoLastVoiceCommand(bookId)).toBe(true);
    expect(useStore.getState().dictationDrafts[bookId]).toEqual(spoken);
  });

  it('is a no-op when no command is on the stack', () => {
    const bookId = useStore.getState().createBook('Undo empty test', 'fantasy');
    created.push(bookId);
    const spoken = joinDraft([], 'the rain came period');
    useStore.getState().setDictationDraft(bookId, spoken);
    expect(useStore.getState().undoLastVoiceCommand(bookId)).toBe(false);
    expect(useStore.getState().dictationDrafts[bookId]).toEqual(spoken);
  });
});
