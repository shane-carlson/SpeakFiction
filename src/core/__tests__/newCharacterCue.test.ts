import { describe, expect, it } from 'vitest';
import { extractNewCharacterCues, takeRepeatedName } from '../newCharacterCue';

describe('takeRepeatedName', () => {
  it('takes a one-word name spoken twice', () => {
    const taken = takeRepeatedName(' Andreos. Andreos.');
    expect(taken).toMatchObject({ first: 'Andreos', second: 'Andreos' });
  });

  it('takes a two-word name spoken twice', () => {
    const taken = takeRepeatedName(' Mara Vale. Mara Vale. the wind howled');
    expect(taken).toMatchObject({ first: 'Mara Vale', second: 'Mara Vale' });
    const rest = ' Mara Vale. Mara Vale. the wind howled'.slice(taken!.consumed).trim();
    expect(rest).toBe('the wind howled');
  });

  it('requires the name twice', () => {
    expect(takeRepeatedName(' Kael. the wind howled')).toBeNull();
    expect(takeRepeatedName('')).toBeNull();
  });

  it('accepts a close Whisper miss of the second saying', () => {
    const taken = takeRepeatedName(' Andreos Andreus');
    expect(taken).toMatchObject({ first: 'Andreos', second: 'Andreus' });
  });
});

describe('extractNewCharacterCues', () => {
  it('extracts New Character plus a name said twice and leaves no remainder', () => {
    const out = extractNewCharacterCues('New Character. Andreos. Andreos.');
    expect(out.remainder).toBe('');
    expect(out.characters).toEqual([{ canonical: 'Andreos', aliases: [] }]);
  });

  it('keeps leftover prose after the cue and repeated name', () => {
    const out = extractNewCharacterCues('New Character. Kael. Kael. the wind howled');
    expect(out.remainder).toMatch(/the wind howled/i);
    expect(out.remainder).not.toMatch(/new character/i);
    expect(out.remainder).not.toMatch(/\bKael\b/);
    expect(out.characters).toEqual([{ canonical: 'Kael', aliases: [] }]);
  });

  it('keeps prose that came before the cue', () => {
    const out = extractNewCharacterCues('The gate opened. New Character. Mara Vale. Mara Vale.');
    expect(out.remainder).toMatch(/The gate opened/i);
    expect(out.remainder).not.toMatch(/new character/i);
    expect(out.remainder).not.toMatch(/Mara Vale/i);
    expect(out.characters[0]?.canonical).toBe('Mara Vale');
  });

  it('tolerates Whisper typos like charachter', () => {
    const out = extractNewCharacterCues('New Charachter. Andreos. Andreos.');
    expect(out.remainder).toBe('');
    expect(out.characters[0]?.canonical).toBe('Andreos');
  });

  it('does not extract unless the name is spoken twice', () => {
    const out = extractNewCharacterCues('New Character. Andreos. the wind howled');
    expect(out.characters).toEqual([]);
    expect(out.remainder).toMatch(/new character/i);
    expect(out.remainder).toMatch(/Andreos/i);
    expect(out.remainder).toMatch(/the wind howled/i);
  });

  it('leaves ordinary prose that mentions new characters', () => {
    const out = extractNewCharacterCues('they met new characters along the way');
    expect(out.characters).toEqual([]);
    expect(out.remainder).toMatch(/new characters/i);
    expect(out.remainder).toMatch(/along the way/i);
  });

  it('records a distinct spoken form as an alias', () => {
    const out = extractNewCharacterCues('New Character. Andreos. Andreus.');
    expect(out.characters[0]?.canonical).toBe('Andreos');
    expect(out.characters[0]?.aliases.map((a) => a.toLowerCase())).toContain('andreus');
  });

  it('extracts more than one cue in the same utterance', () => {
    const out = extractNewCharacterCues('New Character. Kael. Kael. New Character. Mira. Mira.');
    expect(out.remainder).toBe('');
    expect(out.characters.map((c) => c.canonical)).toEqual(['Kael', 'Mira']);
  });
});
