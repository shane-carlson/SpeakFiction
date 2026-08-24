import { cuesFromSegments, type WordCue } from './wordCues';
import { applyVocab } from './speechVocab';

type SpeechModule = {
  requestPermissionsAsync?: () => Promise<{ granted?: boolean }>;
  start?: (opts: Record<string, unknown>) => Promise<void> | void;
  stop?: () => Promise<void> | void;
  addListener?: (
    event: string,
    cb: (event: {
      isFinal?: boolean;
      transcript?: string;
      message?: string;
      results?: Array<{
        transcript?: string;
        segments?: Array<{ segment?: string; transcript?: string; startTimeMillis?: number; endTimeMillis?: number }>;
      }>;
    }) => void,
  ) => { remove: () => void };
};

export type TranscribeOpts = {
  contextualStrings?: string[];
  replacements?: Array<{ heard: string; word: string }>;
};

async function loadSpeech(): Promise<SpeechModule | null> {
  try {
    const mod = await import('expo-speech-recognition');
    return (mod.ExpoSpeechRecognitionModule ?? mod) as SpeechModule;
  } catch {
    return null;
  }
}

function applyReplacements(text: string, opts?: TranscribeOpts): string {
  return applyVocab(
    text,
    opts?.replacements?.map((item) => ({ word: item.word, heard: item.heard })) ?? [],
  );
}

/** Transcribe a finished take. Do not run this while expo-av is still recording — iOS will steal the mic and the file stays silent. */
export async function transcribeAudioFile(
  uri: string,
  opts?: TranscribeOpts,
): Promise<{ text: string; words: WordCue[] }> {
  const speech = await loadSpeech();
  if (!speech?.start || !speech.stop || !uri) return { text: '', words: [] };
  if (speech.requestPermissionsAsync) {
    const perm = await speech.requestPermissionsAsync();
    if (perm && perm.granted === false) return { text: '', words: [] };
  }

  return await new Promise((resolve) => {
    let finalText = '';
    let lastPartial = '';
    const words: WordCue[] = [];
    let settled = false;
    const finish = (text = (finalText || lastPartial).trim()) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      void speech.stop?.();
      resultSub?.remove();
      endSub?.remove();
      errSub?.remove();
      resolve({ text: applyReplacements(text, opts), words });
    };

    const resultSub = speech.addListener?.('result', (event) => {
      const first = event.results?.[0];
      const transcript = (first?.transcript || event.transcript || '').trim();
      if (transcript) {
        if (event.isFinal) finalText = finalText ? `${finalText} ${transcript}` : transcript;
        else lastPartial = transcript;
      }
      const segs = first?.segments;
      if (event.isFinal && Array.isArray(segs) && segs.length) {
        words.push(...cuesFromSegments(segs));
      }
    });
    const endSub = speech.addListener?.('end', () => finish());
    const errSub = speech.addListener?.('error', () => finish());
    const timer = window.setTimeout(() => finish(), 90_000);

    void Promise.resolve(
      speech.start?.({
        lang: 'en-US',
        interimResults: true,
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
        continuous: true,
        androidIntentOptions: { EXTRA_REQUEST_WORD_TIMING: true },
        contextualStrings: opts?.contextualStrings?.length ? opts.contextualStrings : undefined,
        audioSource: { uri },
      }),
    ).catch(() => finish(''));
  });
}
