import { createManuscriptVersionRecorder } from './manuscriptVersionRecorder';
import { defaultVersionBackend } from './manuscriptVersionStore';

let recorder: ReturnType<typeof createManuscriptVersionRecorder> | null = null;

export function manuscriptVersionRecorder() {
  if (!recorder) {
    recorder = createManuscriptVersionRecorder({
      backend: defaultVersionBackend(),
    });
  }
  return recorder;
}

/** Tests only — swap the live recorder. */
export function setManuscriptVersionRecorderForTests(
  next: ReturnType<typeof createManuscriptVersionRecorder> | null,
): void {
  recorder = next;
}
