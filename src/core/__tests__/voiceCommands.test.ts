import { parseVoiceCommand } from '../voiceCommands';

describe('parseVoiceCommand', () => {
  it('starts and resumes dictation', () => {
    expect(parseVoiceCommand('start dictation')).toEqual({ command: 'start', remainder: '' });
    expect(parseVoiceCommand('begin dictation')).toEqual({ command: 'start', remainder: '' });
    expect(parseVoiceCommand('resume dictation')).toEqual({ command: 'start', remainder: '' });
    expect(parseVoiceCommand('continue dictation')).toEqual({ command: 'start', remainder: '' });
  });

  it('pauses only when the utterance is a command', () => {
    expect(parseVoiceCommand('pause')).toEqual({ command: 'pause', remainder: '' });
    expect(parseVoiceCommand('pause dictation')).toEqual({ command: 'pause', remainder: '' });
    expect(parseVoiceCommand('he hit pause on the tape').command).toBeNull();
  });

  it('stops capture', () => {
    expect(parseVoiceCommand('stop dictation')).toEqual({ command: 'stop', remainder: '' });
    expect(parseVoiceCommand('end dictation')).toEqual({ command: 'stop', remainder: '' });
    expect(parseVoiceCommand('stop listening')).toEqual({ command: 'stop', remainder: '' });
  });

  it('strips a trailing command from prose', () => {
    expect(parseVoiceCommand('the wind howled stop dictation')).toEqual({
      command: 'stop',
      remainder: 'the wind howled',
    });
  });

  it('parses StrikeLastSentence without inserting those words', () => {
    expect(parseVoiceCommand('strike last sentence')).toEqual({
      command: 'strikeLastSentence',
      remainder: '',
    });
    expect(parseVoiceCommand('scratch last sentence')).toEqual({
      command: 'strikeLastSentence',
      remainder: '',
    });
    expect(parseVoiceCommand('strike that sentence')).toEqual({
      command: 'strikeLastSentence',
      remainder: '',
    });
    expect(parseVoiceCommand('scratch that sentence')).toEqual({
      command: 'strikeLastSentence',
      remainder: '',
    });
    expect(parseVoiceCommand('please strike the last sentence')).toEqual({
      command: 'strikeLastSentence',
      remainder: '',
    });
    expect(parseVoiceCommand('the wind howled strike last sentence')).toEqual({
      command: 'strikeLastSentence',
      remainder: 'the wind howled',
    });
  });
});
