import { applyNarrativeTense, getTense, stripSpokenTenseCues } from '../tense';

describe('tense profiles', () => {
  it('defaults unknown ids to past', () => {
    expect(getTense('past').id).toBe('past');
    expect(getTense(undefined).id).toBe('past');
    expect(getTense('nope').name).toBe('Past');
  });

  it('describes narration vs dialogue', () => {
    expect(getTense('present').narrativeHint).toMatch(/Dialogue/);
    expect(getTense('past').narrativeHint).toMatch(/he said/);
  });
});

describe('stripSpokenTenseCues', () => {
  it('drops audio-cue style tense announcements', () => {
    expect(stripSpokenTenseCues('write in past tense the door opened')).toBe('the door opened');
    expect(stripSpokenTenseCues('present tense she runs')).toBe('she runs');
  });
});

describe('applyNarrativeTense', () => {
  it('normalizes dialogue tags in past-tense narration', () => {
    expect(applyNarrativeTense('“We ride at dawn,” he says.', 'past')).toBe(
      '“We ride at dawn,” he said.',
    );
    expect(applyNarrativeTense('They say nothing.', 'past')).toBe('They said nothing.');
  });

  it('normalizes dialogue tags in present-tense narration', () => {
    expect(applyNarrativeTense('“Stay,” she said.', 'present')).toBe('“Stay,” she says.');
    expect(applyNarrativeTense('They said nothing.', 'present')).toBe('They say nothing.');
  });

  it('does not rewrite verbs inside quoted dialogue', () => {
    expect(applyNarrativeTense('“I go now,” he says.', 'past')).toBe('“I go now,” he said.');
  });

  it('rewrites only sentence-initial I go / I went in narration', () => {
    expect(applyNarrativeTense('I go to the door.', 'past')).toBe('I went to the door.');
    expect(applyNarrativeTense('I went to the door.', 'present')).toBe('I go to the door.');
    expect(applyNarrativeTense('Then I walk to the door.', 'past')).toBe('Then I walk to the door.');
  });

  it('leaves future-tense tags alone', () => {
    expect(applyNarrativeTense('“Wait,” he said.', 'future')).toBe('“Wait,” he said.');
  });
});
