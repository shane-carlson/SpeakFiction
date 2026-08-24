import {
  collapseRepeats,
  collapseRepeatedPhrases,
  cleanTranscript,
  isMostlyOneToken,
  isSilenceLoop,
  stripLeadingSilenceFiller,
} from '../transcriptCleanup';

describe('transcriptCleanup', () => {
  it('collapses long consecutive repeats', () => {
    expect(collapseRepeats('rock, rock, rock, rock')).toBe('rock, rock,');
    expect(collapseRepeats('5 5 5 5 5')).toBe('5 5');
  });

  it('rejects mostly-one-token hallucinations', () => {
    expect(isMostlyOneToken('5 5 5 5 5 5 5 5')).toBe(true);
    expect(isMostlyOneToken('the morning started like any other morning')).toBe(false);
  });

  it('drops whisper filler and garbage loops', () => {
    expect(cleanTranscript('thanks for watching')).toBe('');
    expect(cleanTranscript('yeah yeah yeah yeah')).toBe('');
    expect(cleanTranscript('you')).toBe('');
    expect(cleanTranscript('the morning started like any other morning')).toBe(
      'the morning started like any other morning',
    );
  });

  it('rejects silence loops of no / yeah / thanks-for-watching', () => {
    expect(cleanTranscript('no, no')).toBe('');
    expect(cleanTranscript('no no')).toBe('');
    expect(cleanTranscript('No. No.')).toBe('');
    expect(cleanTranscript('yeah yeah yeah')).toBe('');
    expect(cleanTranscript('thanks for watching.')).toBe('');
    expect(isSilenceLoop('no, no')).toBe(true);
    expect(isSilenceLoop('No, she said no.')).toBe(false);
  });

  it('keeps a real sentence that contains no', () => {
    expect(cleanTranscript('No, she said no.')).toBe('No, she said no.');
    expect(cleanTranscript('She said no and turned away.')).toBe('She said no and turned away.');
  });

  it('rejects a silence loop without dropping a following sentence', () => {
    expect(cleanTranscript('no, no')).toBe('');
    expect(cleanTranscript('the morning started like any other morning')).toBe(
      'the morning started like any other morning',
    );
  });

  it('never treats spoken structure cues as filler', () => {
    expect(cleanTranscript('new paragraph')).toBe('new paragraph');
    expect(cleanTranscript('new scene')).toBe('new scene');
    expect(cleanTranscript('new chapter titled The Gate period the wind howled')).toBe(
      'new chapter titled The Gate period the wind howled',
    );
    expect(isSilenceLoop('new chapter')).toBe(false);
  });

  it('strips a glued filler loop from the sentence that follows', () => {
    expect(stripLeadingSilenceFiller('no no the morning started like any other')).toBe(
      'the morning started like any other',
    );
    expect(cleanTranscript('no no the morning started like any other')).toBe(
      'the morning started like any other',
    );
    expect(stripLeadingSilenceFiller('No, she said no.')).toBe('No, she said no.');
  });

  it('drops a thank-you-for-listening silence loop without eating the sentence before it', () => {
    const loop = Array(25).fill('thank you for listening').join(' ');
    expect(cleanTranscript(loop)).toBe('');
    expect(cleanTranscript(`She introduced a healer from the vale. ${loop}`)).toBe(
      'She introduced a healer from the vale.',
    );
    expect(cleanTranscript('I want to thank you for listening')).toBe('I want to thank you for listening');
    expect(cleanTranscript('thanks for listening')).toBe('');
  });

  it('collapses a repeated 4-word phrase without dropping the sentence before it', () => {
    const loop = Array(8).fill('the gate stood open').join(' ');
    expect(collapseRepeatedPhrases(loop).text).toBe('the gate stood open');
    expect(cleanTranscript(`Kaeldros waited. ${loop}`)).toMatch(/Kaeldros waited/i);
    expect(cleanTranscript(`Kaeldros waited. ${loop}`)).not.toMatch(/the gate stood open the gate stood open/i);
  });
});
