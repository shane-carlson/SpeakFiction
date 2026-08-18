import {
  applyNarrativePerspective,
  getPerspective,
  stripSpokenPerspectiveCues,
} from '../perspective';

describe('perspective profiles', () => {
  it('defaults unknown ids to third limited', () => {
    expect(getPerspective('third-limited').id).toBe('third-limited');
    expect(getPerspective(undefined).id).toBe('third-limited');
    expect(getPerspective('nope').name).toBe('Third limited');
  });

  it('describes narration vs dialogue', () => {
    expect(getPerspective('first').narrativeHint).toMatch(/Quoted dialogue/);
    expect(getPerspective('second').narrativeHint).toMatch(/left alone/i);
  });
});

describe('stripSpokenPerspectiveCues', () => {
  it('drops audio-cue style perspective announcements', () => {
    expect(stripSpokenPerspectiveCues('write in first person the door opened')).toBe('the door opened');
    expect(stripSpokenPerspectiveCues('third person limited she runs')).toBe('she runs');
    expect(stripSpokenPerspectiveCues('third omniscient the army moved')).toBe('the army moved');
  });
});

describe('applyNarrativePerspective', () => {
  it('turns a post-quote he/she tag into I in first person', () => {
    expect(applyNarrativePerspective('“We ride at dawn,” he said.', 'first')).toBe(
      '“We ride at dawn,” I said.',
    );
    expect(applyNarrativePerspective('“Stay,” she says.', 'first')).toBe('“Stay,” I say.');
  });

  it('does not rewrite quoted dialogue or character-name tags', () => {
    expect(applyNarrativePerspective('“I go now,” he said.', 'first')).toBe('“I go now,” I said.');
    expect(applyNarrativePerspective('“Wait,” Kaeldros said.', 'first')).toBe('“Wait,” Kaeldros said.');
  });

  it('does not rewrite he said mid-narration about another character', () => {
    expect(applyNarrativePerspective('Then he said the sky was dark.', 'first')).toBe(
      'Then he said the sky was dark.',
    );
    expect(applyNarrativePerspective('He said the sky was dark.', 'first')).toBe(
      'He said the sky was dark.',
    );
  });

  it('leaves third- and second-person prose alone', () => {
    expect(applyNarrativePerspective('“Stay,” he said.', 'third-limited')).toBe('“Stay,” he said.');
    expect(applyNarrativePerspective('“Stay,” I said.', 'third-limited')).toBe('“Stay,” I said.');
    expect(applyNarrativePerspective('“Stay,” he said.', 'second')).toBe('“Stay,” he said.');
  });
});
