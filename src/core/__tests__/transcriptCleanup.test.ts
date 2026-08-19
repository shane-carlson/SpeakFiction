import { collapseRepeats, cleanTranscript, isMostlyOneToken, isSilenceLoop } from '../transcriptCleanup';

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
});
