import type { GenreProfile, PerspectiveId } from './types';
import type { Segment } from './audioCues';
import { capitalizeSentences, foldAndButSentences } from './punctuation';

/** Inserted between fiction paragraphs; exploded after audio-cue parsing. */
export const PARA_MARK = '\uE001';

const DASH = { em: '\u2014', en: '\u2013', hyphen: '-' } as const;

const SPEECH_VERBS =
  'said|says|say|asked|asks|whispered|whispers|muttered|replied|answered|shouted|yelled|cried|called|murmured|snapped|hissed|growled|added|continued|demanded|explained|remarked|warned|pleaded|gasped|inquired|told|spoke|began|offered|insisted|agreed|laughed|breathed|noted|observed|declared|announced|interrupted|countered|retorted|queried|echoed|bellowed|screamed|sighed|chuckled|teased|promised|lied|joked|barked|exclaimed|protested|repeated|sobbed|stammered|urged|vowed|blurted|chided|confessed|drawled|groaned|moaned|scoffed|scolded|whined|wondered';

const STT_TAG_VERBS = `${SPEECH_VERBS}|goes|go|went|going`;

const DEFAULT_WHO = `he|she|I|we|they|[A-Z][\\w']+(?:\\s+[A-Z][\\w']+)?`;

const INDIRECT =
  /^(that|the|a|an|his|her|their|its|this|those|these|there|then|nothing|something|anything|everything|so|too|little|much|more|it|not|never|always|only|also)\b/i;

const MOTION =
  /^(to|into|toward|towards|from|out|away|home|back|up|down|through|across|over|around|inside|outside|downstairs|upstairs)\b/i;

const SPEECH_START =
  /^(you|you'd|you'll|you're|you've|your|i|i'm|i'll|i've|i'd|we|we'd|we'll|we're|don't|didn't|can't|cannot|won't|let's|wait|stop|run|come|look|listen|please|yes|no|yeah|hey|hello|hi|go|get|stay|leave|what|where|why|who|how|okay|ok|oh|ah|nope|tell|thank|thanks|sorry|well)\b/i;

const TRAILING_SPEECH_WORDS = 24;
const LEADING_SPEECH_WORDS = 28;
const LEADING_HEAD_WORDS = 16;
const NAME_ONLY_WORDS = 28;
const UNTAGGED_MAX_WORDS = 32;

const UNTAGGED_MINI =
  /^(wait|stop|yes|no|yeah|hey|hello|hi|nope|okay|ok|please|oh|thanks|sorry)$/i;
/** Address, command, or vocative — not hedge/narration openers like maybe/never/anyway. */
const UNTAGGED_ADDRESS =
  /^(you|you'd|you'll|you're|you've|your|don't|didn't|can't|cannot|won't|let's|wait|stop|please|yes|no|yeah|hey|hello|hi|nope|okay|ok|oh|thank|thanks|sorry)\b/i;
const UNTAGGED_IMPERATIVE =
  /^(wait|stop|run|come|look|go|get|stay|leave|don't|let's|please)\b/i;
const FIRST_PERSON_START = /^(i|i'm|i'll|i've|i'd|we|we'd|we'll|we're|we've)\b/i;
const FIRST_PERSON_ANY =
  /\b(i|i'm|i'll|i've|i'd|me|my|myself|we|us|our|ours|ourselves)\b/i;
const SECOND_PERSON_START = /^(you|you'd|you'll|you're|you've|your)\b/i;
const SECOND_PERSON_ANY = /\b(you|you'd|you'll|you're|you've|your|yours)\b/i;
const QUESTION_START = /^(what|where|why|who|how)\b/i;
const WHEN_QUESTION = /^when\s+(are|is|did|do|will|were|was|can|could|would)\b/i;
const NOT_A_SPEAKER =
  /^(The|A|An|When|If|After|Before|As|Although|Though|While|Because|Since|Then|There|This|That|These|Those|And|But|Or|So|Not|It|He|She|They|We|I|My|His|Her|Their|Our|Your|Yes|No|Oh|Well)$/;

export interface ProseStructureOptions {
  /** Canonical character names from the name library; used as speakers. */
  characterNames?: string[];
  /** Book viewpoint. Untagged quotes stay conservative in first and second person. */
  perspective?: PerspectiveId;
}

function quotes(profile: GenreProfile): { open: string; close: string } {
  if (profile.quoteStyle === 'curly') return { open: '\u201C', close: '\u201D' };
  return { open: '"', close: '"' };
}

function isQuoted(span: string): boolean {
  const t = span.trim();
  return t.startsWith('\u201C') || t.startsWith('"');
}

function capitalizeSpan(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameAlternation(names: string[]): string {
  const alts = names
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) =>
      n
        .split(/\s+/)
        .map((part) =>
          escapeRe(part).replace(/[A-Za-z]/g, (ch) => `[${ch.toUpperCase()}${ch.toLowerCase()}]`),
        )
        .join('\\s+'),
    );
  return alts.join('|');
}

function whoPattern(names: string[]): string {
  const named = nameAlternation(names);
  return named ? `${named}|${DEFAULT_WHO}` : DEFAULT_WHO;
}

function looksLikeSpeech(s: string): boolean {
  const t = s.trim();
  if (!t || isQuoted(t)) return false;
  if (MOTION.test(t)) return false;
  if (SPEECH_START.test(t)) return true;
  if (/[?!]$/.test(t) && wordCount(t) <= LEADING_SPEECH_WORDS && SECOND_PERSON_ANY.test(t)) return true;
  return false;
}

function looksLikeSpokenQuestion(s: string, perspective?: PerspectiveId): boolean {
  const t = s.trim();
  if (!/[?]$/.test(t) && !QUESTION_START.test(t) && !WHEN_QUESTION.test(t)) return false;
  if (SECOND_PERSON_ANY.test(t)) return true;
  const bare = t.replace(/[.!?]+$/g, '').trim();
  if (UNTAGGED_MINI.test(bare)) return true;
  if (perspective === 'first' || perspective === 'second' || FIRST_PERSON_ANY.test(t)) return false;
  if ((QUESTION_START.test(t) || WHEN_QUESTION.test(t)) && wordCount(t) <= TRAILING_SPEECH_WORDS) {
    return true;
  }
  return false;
}

function looksLikeUntaggedDialogue(s: string, perspective?: PerspectiveId): boolean {
  const raw = s.trim();
  if (!raw || isQuoted(raw) || MOTION.test(raw) || INDIRECT.test(raw)) return false;
  const words = wordCount(raw);
  if (words > UNTAGGED_MAX_WORDS) return false;
  const bare = raw.replace(/[.!?]+$/g, '').trim();

  if (FIRST_PERSON_START.test(raw)) return false;
  if (
    /^(don't|didn't|can't|cannot|won't)\b/i.test(raw) &&
    FIRST_PERSON_ANY.test(raw) &&
    !SECOND_PERSON_ANY.test(raw)
  ) {
    return false;
  }
  if (
    /^(yes|no|oh|well)\b/i.test(raw) &&
    FIRST_PERSON_ANY.test(raw) &&
    !SECOND_PERSON_ANY.test(raw) &&
    words > 6
  ) {
    return false;
  }
  if (
    perspective === 'second' &&
    SECOND_PERSON_START.test(raw) &&
    !UNTAGGED_IMPERATIVE.test(raw) &&
    !UNTAGGED_MINI.test(bare)
  ) {
    return false;
  }

  if (words === 1 && !UNTAGGED_MINI.test(bare) && !/[!?]$/.test(raw)) return false;
  if (UNTAGGED_MINI.test(bare)) return true;
  if (UNTAGGED_ADDRESS.test(raw)) return true;
  if (UNTAGGED_IMPERATIVE.test(raw) && words <= TRAILING_SPEECH_WORDS) return true;
  if (looksLikeSpokenQuestion(raw, perspective)) return true;
  return false;
}

function looksLikeNarrationPrefix(prefix: string): boolean {
  const t = prefix.trim();
  if (!t) return false;
  if (
    INDIRECT.test(t) ||
    /^(he|she|they|i|we|when|if|after|before|as|although|though|while|because|since)\b/i.test(t)
  ) {
    return true;
  }
  return wordCount(t) >= 2;
}

function firstSpeechSpan(text: string): string {
  const trimmed = text.trim();
  const punct = trimmed.match(/^(.+?[.!?])(?:\s+|$)/s);
  return punct ? punct[1].trim() : trimmed;
}

function mapOutsideQuotes(text: string, fn: (narration: string) => string): string {
  const quoted = /([\u201C"][^\u201D"]*(?:[\u201D"]|$))/g;
  let last = 0;
  let out = '';
  let match: RegExpExecArray | null;
  while ((match = quoted.exec(text))) {
    out += fn(text.slice(last, match.index));
    out += match[0];
    last = match.index + match[0].length;
  }
  out += fn(text.slice(last));
  return out;
}

function wrapSpeech(inner: string, open: string, close: string, commaInside: boolean): string {
  let trimmed = inner.trim().replace(/^[,]+/g, '').replace(/[,.]+$/g, '');
  if (!trimmed || isQuoted(trimmed)) return inner.trim();
  trimmed = capitalizeSpan(trimmed);
  const bang = /[!?]$/.test(trimmed);
  const inside = bang || !commaInside ? trimmed : `${trimmed},`;
  return `${open}${inside}${close}`;
}

function extractTrailingSpeech(before: string): { narration: string; speech: string } {
  const trimmed = before.trim();
  if (!trimmed) return { narration: '', speech: '' };

  const sent = trimmed.match(/^(.*[.!?])\s+([^.!?]+)$/);
  if (sent && (looksLikeSpeech(sent[2]) || wordCount(sent[2]) <= TRAILING_SPEECH_WORDS)) {
    return { narration: sent[1], speech: sent[2] };
  }

  const words = trimmed.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const rest = words.slice(i).join(' ');
    if (wordCount(rest) <= LEADING_SPEECH_WORDS && looksLikeSpeech(rest)) {
      return {
        narration: i > 0 ? words.slice(0, i).join(' ') : '',
        speech: rest,
      };
    }
  }
  if (wordCount(trimmed) <= TRAILING_SPEECH_WORDS && !INDIRECT.test(trimmed)) {
    return { narration: '', speech: trimmed };
  }
  if (wordCount(trimmed) <= TRAILING_SPEECH_WORDS) return { narration: '', speech: trimmed };
  return { narration: trimmed, speech: '' };
}

function extractLeadingSpeech(after: string): { speech: string; rest: string } {
  const trimmed = after.trim();
  if (
    !trimmed ||
    /^[.!?]+$/.test(trimmed) ||
    INDIRECT.test(trimmed) ||
    MOTION.test(trimmed) ||
    isQuoted(trimmed)
  ) {
    return { speech: '', rest: trimmed };
  }
  const punct = trimmed.match(/^(.+?[.!?])\s+(.+)$/s);
  if (punct && wordCount(punct[1]) <= LEADING_SPEECH_WORDS && punct[1].replace(/[.!?]+$/g, '').trim()) {
    return { speech: punct[1], rest: punct[2] };
  }
  if (wordCount(trimmed) <= TRAILING_SPEECH_WORDS) return { speech: trimmed, rest: '' };
  const words = trimmed.split(/\s+/);
  const head = words.slice(0, LEADING_HEAD_WORDS).join(' ');
  if (looksLikeSpeech(head) || !INDIRECT.test(head)) {
    return { speech: head, rest: words.slice(LEADING_HEAD_WORDS).join(' ') };
  }
  return { speech: '', rest: trimmed };
}

/**
 * US fiction: comma (or keep ?/!) inside the quote immediately before a dialogue tag.
 */
export function fixDialogueTagCommas(text: string, characterNames: string[] = []): string {
  const who = whoPattern(characterNames);
  const tag = new RegExp(
    `([\\u201C"])([^\\u201D"]*?)([\\u201D"])(\\s+)(${who})\\s+(${SPEECH_VERBS})\\b`,
    'g',
  );
  return text.replace(tag, (_m, oq: string, inner: string, cq: string, sp: string, whoName: string, verb: string) => {
    const core = inner.replace(/[,.\s]+$/g, '').trimEnd();
    const keep = /[!?]$/.test(core) ? core : `${core},`;
    return `${oq}${keep}${cq}${sp}${whoName} ${verb}`;
  });
}

function normalizeSttTags(text: string, who: string): string {
  const re = new RegExp(`\\b(${who})\\s+(goes|go|went|going)\\b`, 'g');
  return text.replace(re, (full, speaker: string, _verb: string, offset: number) => {
    const after = text.slice(offset + full.length).trim();
    if (!after || MOTION.test(after) || INDIRECT.test(after) || !looksLikeSpeech(after)) return full;
    return `${speaker} said`;
  });
}

function wrapTaggedDialogue(core: string, open: string, close: string, who: string): string {
  const tagRe = new RegExp(`\\b(${who})\\s+(${STT_TAG_VERBS})\\b`, 'g');
  const tags = [...core.matchAll(tagRe)];
  if (tags.length === 0) return core;

  const parts: string[] = [];
  let cursor = 0;

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const idx = tag.index ?? 0;
    const speaker = tag[1];
    let verb = tag[2];
    if (/^(goes|go|went|going)$/i.test(verb)) verb = 'said';
    const afterStart = idx + tag[0].length;
    const nextIdx = tags[i + 1]?.index ?? core.length;
    const before = core.slice(cursor, idx);
    const after = core.slice(afterStart, nextIdx);
    const beforeTrim = before.trim();
    const afterTrim = after.trim();
    const leading = extractLeadingSpeech(afterTrim);

    const leadingCore = leading.speech.replace(/[.!?]+$/, '').trim();
    if (leadingCore && !isQuoted(leading.speech)) {
      const end = leading.speech.match(/[.!?]+$/)?.[0] ?? (leading.rest ? '' : '.');
      const speech = leadingCore;
      const gap = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
      const rest = leading.rest ? ` ${leading.rest}` : '';
      const closer = end || '';
      parts.push(
        `${before}${gap}${speaker} ${verb}, ${open}${capitalizeSpan(speech)}${closer || '.'}${close}${rest}`,
      );
      cursor = nextIdx;
      continue;
    }

    const trailingAfter = !afterTrim || /^[.!?]+$/.test(afterTrim);
    if (trailingAfter && beforeTrim && !isQuoted(beforeTrim)) {
      const extracted = extractTrailingSpeech(beforeTrim);
      if (extracted.speech) {
        const end = afterTrim.match(/[.!?]+$/)?.[0] ?? '.';
        const narr = extracted.narration
          ? `${extracted.narration.replace(/[.!?]$/, '')}. `
          : '';
        parts.push(`${narr}${wrapSpeech(extracted.speech, open, close, true)} ${speaker} ${verb}${end}`);
        cursor = nextIdx;
        continue;
      }
    }

    parts.push(core.slice(cursor, afterStart));
    cursor = afterStart;
  }

  parts.push(core.slice(cursor));
  return parts.join('');
}

function wrapUntaggedSpeech(inner: string, open: string, close: string): string {
  let trimmed = inner.trim().replace(/^[,]+/g, '').replace(/[,]+$/g, '');
  if (!trimmed || isQuoted(trimmed)) return inner.trim();
  trimmed = capitalizeSpan(trimmed);
  if (!/[.!?]$/.test(trimmed)) trimmed = `${trimmed}.`;
  return `${open}${trimmed}${close}`;
}

function wrapNameOnlyDialogue(
  core: string,
  open: string,
  close: string,
  names: string[],
  perspective?: PerspectiveId,
): string {
  const named = nameAlternation(names);
  if (!named) return core;
  const re = new RegExp(`\\b(${named})\\s+(?!${STT_TAG_VERBS}\\b)([^]+)`, 'g');
  return core.replace(re, (full, speaker: string, rest: string) => {
    if (/[\u201C"]/.test(full)) return full;
    const span = firstSpeechSpan(rest);
    if (
      !looksLikeUntaggedDialogue(span, perspective) ||
      isQuoted(span) ||
      wordCount(span) > NAME_ONLY_WORDS
    ) {
      return full;
    }
    const end = span.match(/[.!?]+$/)?.[0] ?? '.';
    const speech = span.replace(/[.!?]+$/, '');
    const after = rest.trim().slice(span.length).trim();
    const tail = after ? ` ${after}` : '';
    return `${wrapSpeech(speech, open, close, true)} ${speaker} said${end}${tail}`;
  });
}

function wrapBareSpeakerDialogue(
  core: string,
  open: string,
  close: string,
  perspective?: PerspectiveId,
): string {
  const re = new RegExp(`\\b([A-Z][\\w']+(?:\\s+[A-Z][\\w']+)?)\\s+(?!${STT_TAG_VERBS}\\b)([^]+)`, 'g');
  return core.replace(re, (full, speaker: string, rest: string) => {
    const first = speaker.split(/\s+/)[0] ?? speaker;
    if (NOT_A_SPEAKER.test(speaker) || NOT_A_SPEAKER.test(first) || /[\u201C"]/.test(full)) return full;
    const span = firstSpeechSpan(rest);
    if (isQuoted(span) || wordCount(span) > NAME_ONLY_WORDS) return full;
    if (!looksLikeUntaggedDialogue(span, perspective)) return full;
    const end = span.match(/[.!?]+$/)?.[0] ?? '.';
    const speech = span.replace(/[.!?]+$/, '');
    const after = rest.trim().slice(span.length).trim();
    const tail = after ? ` ${after}` : '';
    return `${wrapSpeech(speech, open, close, true)} ${speaker} said${end}${tail}`;
  });
}

function wrapUntaggedDialogue(
  core: string,
  open: string,
  close: string,
  perspective?: PerspectiveId,
): string {
  if (!core.trim() || /[\u201C"]/.test(core)) return core;

  const sentences = splitSentences(core);
  if (sentences.length > 1) {
    return sentences
      .map((sentence) => {
        if (isQuoted(sentence) || !looksLikeUntaggedDialogue(sentence, perspective)) return sentence;
        return wrapUntaggedSpeech(sentence, open, close);
      })
      .join(' ');
  }

  const trimmed = core.trim();
  if (looksLikeUntaggedDialogue(trimmed, perspective)) return wrapUntaggedSpeech(trimmed, open, close);

  const words = trimmed.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const rest = words.slice(i).join(' ');
    const prefix = words.slice(0, i).join(' ');
    const bareRest = rest.replace(/[.!?]+$/g, '').trim();
    if (!looksLikeUntaggedDialogue(rest, perspective)) continue;
    if (FIRST_PERSON_START.test(prefix) || FIRST_PERSON_START.test(trimmed)) continue;
    if (FIRST_PERSON_ANY.test(prefix) && !SECOND_PERSON_START.test(rest)) continue;
    if (!looksLikeNarrationPrefix(prefix)) continue;
    if (
      !SECOND_PERSON_START.test(rest) &&
      !UNTAGGED_MINI.test(bareRest) &&
      !UNTAGGED_IMPERATIVE.test(rest) &&
      !looksLikeSpokenQuestion(rest, perspective)
    ) {
      continue;
    }
    const narrPart = /[.!?]$/.test(prefix) ? `${prefix} ` : `${prefix.replace(/[,]$/, '')}. `;
    return `${narrPart}${wrapUntaggedSpeech(rest, open, close)}`;
  }
  return core;
}

/** Wrap unquoted speech that has a clear said/asked tag. Preserves outer whitespace. */
export function wrapImpliedDialogue(
  narration: string,
  open: string,
  close: string,
  characterNames: string[] = [],
  perspective?: PerspectiveId,
): string {
  const leadWs = narration.match(/^\s*/)?.[0] ?? '';
  const trailWs = narration.match(/\s*$/)?.[0] ?? '';
  let core = narration.slice(leadWs.length, narration.length - trailWs.length);
  if (!core) return narration;

  const who = whoPattern(characterNames);
  core = normalizeSttTags(core, who);
  core = wrapTaggedDialogue(core, open, close, who);
  core = wrapNameOnlyDialogue(core, open, close, characterNames, perspective);
  core = wrapBareSpeakerDialogue(core, open, close, perspective);
  core = wrapUntaggedDialogue(core, open, close, perspective);

  const joined = core
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .trim();
  return `${leadWs}${joined}${trailWs}`;
}

/** Replace space-hyphen-space / double-hyphen with the genre dash. */
export function applyGenreDashes(text: string, profile: GenreProfile): string {
  const dash = DASH[profile.dashStyle];
  const spaced = profile.dashStyle === 'hyphen';
  const token = spaced ? ` ${dash} ` : dash;
  return text
    .replace(/\s+--\s+/g, token)
    .replace(/\s+[\u2013\u2014]\s+/g, token)
    .replace(/\s+-\s+/g, token);
}

/** Said/asked tags take a comma, not a colon, before a quote. */
export function preferCommaBeforeQuotedSpeech(text: string): string {
  const re = new RegExp(`\\b(${SPEECH_VERBS})\\s*:\\s*([\\u201C"])`, 'gi');
  return text.replace(re, '$1, $2');
}

export function applyOxfordComma(text: string, profile: GenreProfile): string {
  if (!profile.oxfordComma) return text;
  return text.replace(/,\s+([^,]+?)\s+and\s+/g, ', $1, and ');
}

export function applyDirectAddressCommas(text: string): string {
  let out = text.replace(
    /\b(Yes|No|Oh|Well|Please|Hello|Goodbye)\s+([A-Z][\w']+)\b/g,
    '$1, $2',
  );
  out = out.replace(
    /\b(Yes|No|Oh|Well|Please|Hello|Goodbye), ([A-Z][\w']+)\s+(we|I|he|she|they|you)\b/g,
    '$1, $2, $3',
  );
  return out;
}

export function applyIntroductoryCommas(text: string): string {
  return text.replace(
    /(^|[.!?]\s+)(When|If|After|Before|As|Although|Though|While|Because|Since)\b([^,]{8,90}?)\s+\b(he|she|I|they|we|[A-Z][\w']+)\s+/g,
    (_m, pre: string, conj: string, clause: string, subj: string) =>
      `${pre}${conj}${clause}, ${subj} `,
  );
}

export function applyListColon(text: string): string {
  return text.replace(/\b(the following|as follows)\s+(?=[A-Z\u201C"])/gi, '$1: ');
}

function speakerOf(sentence: string): string | null {
  const trailing = sentence.match(new RegExp(`[\\u201D"]\\s*(${DEFAULT_WHO})\\s+(?:${SPEECH_VERBS})\\b`, 'i'));
  if (trailing) return trailing[1].toLowerCase();
  const leading = sentence.match(new RegExp(`^(${DEFAULT_WHO})\\s+(?:${SPEECH_VERBS})\\s*,`, 'i'));
  if (leading) return leading[1].toLowerCase();
  return null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function isDialogueSentence(sentence: string): boolean {
  return /[\u201C"]/.test(sentence);
}

function lastSentence(text: string): string {
  const sentences = splitSentences(text.replace(/\s+$/, ''));
  return sentences[sentences.length - 1] ?? text.trim();
}

function firstSentence(text: string): string {
  const sentences = splitSentences(text.replace(/^\s+/, ''));
  return sentences[0] ?? text.trim();
}

/**
 * True when the next span should start a new paragraph: a known speaker change.
 * Untagged quotes and narration stay with the line they follow.
 */
export function shouldStartDialogueParagraph(before: string, next: string): boolean {
  const prev = lastSentence(before);
  const incoming = firstSentence(next);
  if (!isDialogueSentence(prev) || !/^[\u201C"]/.test(incoming.trim())) return false;
  const prevSpeaker = speakerOf(prev);
  const nextSpeaker = speakerOf(incoming);
  return Boolean(prevSpeaker && nextSpeaker && prevSpeaker !== nextSpeaker);
}

/** New paragraph on a speaker change. Narration stays with adjacent tagged dialogue. */
export function splitSpeakerParagraphs(text: string): string {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return text;
  const out: string[] = [];
  let prevWasDialogue = false;
  let prevSpeaker: string | null = null;
  for (const sentence of sentences) {
    const dialogue = isDialogueSentence(sentence);
    const tagged = dialogue ? speakerOf(sentence) : null;
    const speakerChanged = Boolean(
      dialogue && prevWasDialogue && prevSpeaker && tagged && prevSpeaker !== tagged,
    );
    if (speakerChanged) out.push(PARA_MARK);
    out.push(sentence);
    if (dialogue) {
      prevWasDialogue = true;
      if (tagged) prevSpeaker = tagged;
    } else {
      prevWasDialogue = false;
    }
  }
  return out.join(' ').replace(new RegExp(`\\s*${PARA_MARK}\\s*`, 'g'), ` ${PARA_MARK} `).trim();
}

export function explodeParagraphMarks(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.type !== 'text' || !seg.text.includes(PARA_MARK)) {
      out.push(seg);
      continue;
    }
    const parts = seg.text
      .split(PARA_MARK)
      .map((p) => p.trim())
      .filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) out.push({ type: 'structure', event: { kind: 'paragraph' } });
      out.push({ type: 'text', text: parts[i] });
    }
  }
  return out;
}

/**
 * Turn a punctuated transcript toward fiction prose: assumed dialogue quotes,
 * tag commas, and light structural punctuation. Speaker paragraph breaks are
 * applied later so tense/perspective still see a single string.
 */
export function applyProseStructure(
  text: string,
  profile: GenreProfile,
  options: ProseStructureOptions = {},
): string {
  const { open, close } = quotes(profile);
  const names = options.characterNames ?? [];
  let out = text;
  out = applyGenreDashes(out, profile);
  out = preferCommaBeforeQuotedSpeech(out);
  out = applyListColon(out);
  out = applyOxfordComma(out, profile);
  out = mapOutsideQuotes(out, (narr) =>
    wrapImpliedDialogue(narr, open, close, names, options.perspective),
  );
  out = fixDialogueTagCommas(out, names);
  out = applyDirectAddressCommas(out);
  out = applyIntroductoryCommas(out);
  out = out.replace(/[ \t]+/g, ' ').replace(/[ \t]+([,.;:!?])/g, '$1').trim();
  out = capitalizeSentences(out);
  out = foldAndButSentences(out);
  return out.trim();
}
