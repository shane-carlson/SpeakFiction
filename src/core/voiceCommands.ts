export type DictationCommand = 'start' | 'pause' | 'stop';

export interface ParsedVoiceCommand {
  command: DictationCommand | null;
  remainder: string;
}

const START =
  /^(?:please\s+)?(?:start|begin|resume|continue)(?:\s+(?:dictation|listening))?\.?$/i;
const PAUSE = /^(?:please\s+)?pause(?:\s+dictation)?\.?$/i;
const STOP =
  /^(?:please\s+)?(?:stop(?:\s+(?:dictation|listening))?|end(?:\s+dictation)?)\.?$/i;

const START_IN =
  /\b(?:start|begin|resume|continue)\s+(?:dictation|listening)\b/i;
const PAUSE_IN = /\bpause\s+dictation\b/i;
const STOP_IN = /\b(?:stop|end)\s+(?:dictation|listening)\b|\bstop listening\b/i;

function stripMatch(text: string, match: RegExpMatchArray): string {
  const start = match.index ?? 0;
  return `${text.slice(0, start)} ${text.slice(start + match[0].length)}`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect start/pause/stop commands. Whole-utterance matches win so that
 * prose like "he hit pause on the tape" is not treated as a command.
 */
export function parseVoiceCommand(raw: string): ParsedVoiceCommand {
  const text = raw.trim();
  if (!text) return { command: null, remainder: '' };

  if (START.test(text)) return { command: 'start', remainder: '' };
  if (PAUSE.test(text)) return { command: 'pause', remainder: '' };
  if (STOP.test(text)) return { command: 'stop', remainder: '' };

  const stop = text.match(STOP_IN);
  if (stop) return { command: 'stop', remainder: stripMatch(text, stop) };
  const pause = text.match(PAUSE_IN);
  if (pause) return { command: 'pause', remainder: stripMatch(text, pause) };
  const start = text.match(START_IN);
  if (start) return { command: 'start', remainder: stripMatch(text, start) };

  return { command: null, remainder: text };
}
