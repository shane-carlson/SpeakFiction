export type DictationCommand =
  | 'start'
  | 'pause'
  | 'stop'
  | 'strikeLastSentence'
  | 'undoLastCommand';

export interface ParsedVoiceCommand {
  command: DictationCommand | null;
  remainder: string;
}

const START =
  /^(?:please\s+)?(?:start|begin|resume|continue)(?:\s+(?:dictation|listening))?\.?$/i;
const PAUSE = /^(?:please\s+)?pause(?:\s+dictation)?\.?$/i;
const STOP =
  /^(?:please\s+)?(?:stop(?:\s+(?:dictation|listening))?|end(?:\s+dictation)?)\.?$/i;
const STRIKE =
  /^(?:please\s+)?(?:strike|scratch)(?:\s+(?:the|that))?\s+last\s+sentence\.?$/i;
const STRIKE_THAT =
  /^(?:please\s+)?(?:strike|scratch)\s+that\s+sentence\.?$/i;

const START_IN =
  /\b(?:start|begin|resume|continue)\s+(?:dictation|listening)\b/i;
const PAUSE_IN = /\bpause\s+dictation\b/i;
const STOP_IN = /\b(?:stop|end)\s+(?:dictation|listening)\b|\bstop listening\b/i;
const STRIKE_IN =
  /\b(?:please\s+)?(?:strike|scratch)(?:\s+(?:the|that))?\s+last\s+sentence\b\.?|\b(?:please\s+)?(?:strike|scratch)\s+that\s+sentence\b\.?/i;

const UNDO_TAIL = '(?:\\s+(?:period|full stop))?[.!?]?';
const UNDO_LAST = new RegExp(
  `^(?:please\\s+)?undo(?:\\s+the)?\\s+last\\s+(?:(?:voice|audio|verbal)\\s+)?command${UNDO_TAIL}$`,
  'i',
);
const UNDO_LAST_IN = new RegExp(
  `\\b(?:please\\s+)?undo(?:\\s+the)?\\s+last\\s+(?:(?:voice|audio|verbal)\\s+)?command\\b${UNDO_TAIL}`,
  'i',
);

function stripMatch(text: string, match: RegExpMatchArray): string {
  const start = match.index ?? 0;
  return `${text.slice(0, start)} ${text.slice(start + match[0].length)}`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect start/pause/stop, StrikeLastSentence, and undo-last-command.
 * Whole-utterance matches win so that prose like "he hit pause on the tape"
 * is not treated as a command. StrikeLastSentence and undo act on the
 * dictation box (not inserted as prose) and are stripped from the remainder.
 */
export function parseVoiceCommand(raw: string): ParsedVoiceCommand {
  const text = raw.trim();
  if (!text) return { command: null, remainder: '' };

  if (START.test(text)) return { command: 'start', remainder: '' };
  if (PAUSE.test(text)) return { command: 'pause', remainder: '' };
  if (STOP.test(text)) return { command: 'stop', remainder: '' };
  if (STRIKE.test(text) || STRIKE_THAT.test(text)) {
    return { command: 'strikeLastSentence', remainder: '' };
  }
  if (UNDO_LAST.test(text)) return { command: 'undoLastCommand', remainder: '' };

  const undo = text.match(UNDO_LAST_IN);
  if (undo) return { command: 'undoLastCommand', remainder: stripMatch(text, undo) };
  const stop = text.match(STOP_IN);
  if (stop) return { command: 'stop', remainder: stripMatch(text, stop) };
  const pause = text.match(PAUSE_IN);
  if (pause) return { command: 'pause', remainder: stripMatch(text, pause) };
  const start = text.match(START_IN);
  if (start) return { command: 'start', remainder: stripMatch(text, start) };
  const strike = text.match(STRIKE_IN);
  if (strike) return { command: 'strikeLastSentence', remainder: stripMatch(text, strike) };

  return { command: null, remainder: text };
}
