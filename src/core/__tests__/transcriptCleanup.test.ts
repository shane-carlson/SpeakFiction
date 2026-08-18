import { collapseRepeats, cleanTranscript, isMostlyOneToken } from '../transcriptCleanup';

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
});
