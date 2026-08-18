const FILLER =
  /^(thanks for watching\.?|thank you\.?|thanks\.?|thank you for watching\.?|you|yeah\.?|yep\.?|yes\.?|bye\.?|okay\.?|ok\.?|hmm\.?|uh\.?|um\.?|ah\.?|oh\.?|the|a|and|\.|\,)$/i;

function tokensOf(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function norm(token: string): string {
  return token.toLowerCase().replace(/^[^\w']+|[^\w']+$/g, '');
}

/** Keep at most two consecutive copies of the same word. */
export function collapseRepeats(text: string): string {
  const tokens = tokensOf(text);
  const out: string[] = [];
  let prev = '';
  let run = 0;
  for (const token of tokens) {
    const key = norm(token);
    if (key && key === prev) {
      run += 1;
      if (run < 2) out.push(token);
    } else {
      prev = key;
      run = 0;
      out.push(token);
    }
  }
  return out.join(' ');
}

/** True when one word makes up most of the transcript (Whisper silence loops). */
export function isMostlyOneToken(text: string): boolean {
  const tokens = tokensOf(text).map(norm).filter(Boolean);
  if (tokens.length < 4) return false;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return max / tokens.length >= 0.55;
}

export function cleanTranscript(text: string): string {
  const collapsed = collapseRepeats(text.trim());
  if (!collapsed || FILLER.test(collapsed) || isMostlyOneToken(collapsed)) return '';
  const words = tokensOf(collapsed);
  if (words.length <= 2 && words.every((w) => FILLER.test(w))) return '';
  return collapsed;
}
