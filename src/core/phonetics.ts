/** String-similarity and phonetic helpers used for name-library correction. */

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Normalized similarity in [0,1]; 1 means identical. */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/**
 * Soundex phonetic code. Great for catching phonetically-spelled invented
 * names ("Kaeldros" vs "kaldross"). Returns a 4-char code like "K436".
 */
export function soundex(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';

  const codeOf = (c: string): string => {
    if ('BFPV'.includes(c)) return '1';
    if ('CGJKQSXZ'.includes(c)) return '2';
    if ('DT'.includes(c)) return '3';
    if (c === 'L') return '4';
    if ('MN'.includes(c)) return '5';
    if (c === 'R') return '6';
    return '';
  };

  const first = s[0];
  let prevCode = codeOf(first);
  let result = first;

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const c = s[i];
    const code = codeOf(c);
    if (code !== '' && code !== prevCode) {
      result += code;
    }
    // 'H' and 'W' do not reset the "previous code" separator; vowels do.
    if (c !== 'H' && c !== 'W') {
      prevCode = code;
    }
  }

  return (result + '000').slice(0, 4);
}

/** Lowercase and strip surrounding punctuation from a token. */
export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
}
