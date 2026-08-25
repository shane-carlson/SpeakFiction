import { describe, expect, it } from 'vitest';
import { LITERARY_WHISPER_PROMPT, whisperInboxPrompt, whisperPrompt } from '../whisperPrompt';
import { REMOTE_VOICE_TAKE_PLACEHOLDER } from '../voiceNotes';

describe('whisperPrompt', () => {
  it('keeps the literary base when the book has no names yet', () => {
    expect(whisperPrompt([])).toBe(LITERARY_WHISPER_PROMPT);
  });

  it('appends trained names so Whisper can hear Fae instead of stay', () => {
    expect(whisperPrompt(['Fae', 'Kaeldros'])).toContain('Names: Fae, Kaeldros.');
  });

  it('adds a phone transcript so desktop Whisper can reinterpret punctuation', () => {
    const prompt = whisperInboxPrompt(['Kaeldros'], 'kaldros said no she said no');
    expect(prompt).toContain('Names: Kaeldros.');
    expect(prompt).toContain('Phone take: kaldros said no she said no');
  });

  it('does not feed a voice-only placeholder back into Whisper', () => {
    expect(whisperInboxPrompt(['Kaeldros'], REMOTE_VOICE_TAKE_PLACEHOLDER)).toBe(whisperPrompt(['Kaeldros']));
  });
});
