import { describe, expect, it } from 'vitest';
import { LITERARY_WHISPER_PROMPT, whisperPrompt } from '../whisperPrompt';

describe('whisperPrompt', () => {
  it('keeps the literary base when the book has no names yet', () => {
    expect(whisperPrompt([])).toBe(LITERARY_WHISPER_PROMPT);
  });

  it('appends trained names so Whisper can hear Fae instead of stay', () => {
    expect(whisperPrompt(['Fae', 'Kaeldros'])).toContain('Names: Fae, Kaeldros.');
  });
});
