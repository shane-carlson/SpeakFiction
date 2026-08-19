import { compactDraft, type DictationDraft } from './dictationDraft';
import type { Block } from './types';

export const MAX_VOICE_COMMAND_UNDO = 8;

/** Session snapshot taken before a spoken (or chip) dictation command applies. */
export interface VoiceCommandSnapshot {
  draft: DictationDraft;
  blocks: Block[];
}

export function cloneDraft(draft: DictationDraft): DictationDraft {
  return compactDraft(draft ?? []).map((s) => ({ text: s.text, struck: s.struck }));
}

export function pushVoiceCommandSnapshot(
  stack: VoiceCommandSnapshot[],
  snap: VoiceCommandSnapshot,
): VoiceCommandSnapshot[] {
  return [...stack, snap].slice(-MAX_VOICE_COMMAND_UNDO);
}

export function popVoiceCommandSnapshot(
  stack: VoiceCommandSnapshot[],
): { stack: VoiceCommandSnapshot[]; snap: VoiceCommandSnapshot | null } {
  if (!stack.length) return { stack, snap: null };
  return { stack: stack.slice(0, -1), snap: stack[stack.length - 1] };
}
