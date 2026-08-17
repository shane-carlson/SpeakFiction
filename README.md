# SpeakFiction

**Dictation software built for fiction writers.** SpeakFiction turns spoken storytelling into
clean, structured manuscript prose and hands it off to Scrivener, Word, or Google Docs — with
per-book name libraries, genre-aware punctuation, spoken chapter/scene cues, and a private
on-device model that adapts to how *you* write.

The shipping target is a **native macOS desktop app** (Electron shell). The UI and the entire
dictation "brain" are cross-platform TypeScript, so they run and are fully testable on Linux/CI as
well.

---

## Highlights

- **Per-book / per-series name libraries** — Train complex character, location, item, and
  organization names. Speech-to-text mishears ("kel dros") are rewritten to your canonical
  spelling ("Kaeldros") using edit-distance + phonetic (Soundex) matching, including multi-word
  names.
- **Genre profiles** — Fantasy, Sci-Fi, Thriller, Literary, Mystery, Romance, Horror, YA, and a
  generic default. Each controls quote style (curly/straight), dash style (em/en/hyphen), the
  Oxford comma, ellipses, and scene-break glyphs.
- **Spoken structure ("audio cues")** — Say "new chapter", "new scene", "new section", or
  "new paragraph" (optionally "…titled The Awakening") and SpeakFiction creates the real structural
  boundary. Spoken punctuation ("period", "comma", "open quote"…) is converted too.
- **Private on-device adaptive model** — Learns your vocabulary and correction habits locally to
  bias future recognition. The interface is designed so a Creative-Commons-trained local LLM (e.g.
  via llama.cpp) can drop in as the base model. No prose leaves the device.
- **Guided integrations** — One-click export to Scrivener (RTF + split-on-import), Word (.docx with
  Heading styles + page breaks), Google Docs (.docx upload), Markdown, and plain text, each with
  step-by-step instructions and a live structure preview.

## Ethics

Genre base models are intended to be built **only** from public-domain and Creative-Commons
fiction — never from work authors weren't compensated for. The personal adaptation layer is
computed and stored entirely on the user's machine.

## Tech stack

- **Electron** desktop shell (macOS-first) — `electron/main.cjs`, `electron/preload.cjs`
- **React 18 + TypeScript + Vite** renderer — `src/`
- **Zustand** state with local persistence — `src/store.ts`
- Framework-agnostic dictation engine — `src/core/` (unit-tested with **Vitest**)
- `docx` for Word/Google Docs export

## Getting started

```bash
npm ci          # install dependencies
npm run dev     # start the Vite dev server at http://localhost:5173
```

Run it as the native desktop app:

```bash
npm run dev:electron
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server (renderer) |
| `npm run dev:electron` | Vite + Electron desktop shell |
| `npm test` | Run the Vitest unit suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Type-check + production renderer build |

## Architecture

The dictation pipeline (`src/core/dictationProcessor.ts`) composes small, independently tested
modules:

1. `nameLibrary.ts` — canonicalize trained proper nouns (fuzzy + phonetic).
2. `punctuation.ts` — spoken punctuation commands + genre typography.
3. `audioCues.ts` — split spoken structural cues from prose.
4. `manuscript.ts` — fold segments into an editable chapter/scene/section model.
5. `adaptiveModel.ts` — private, on-device learning layer.
6. `export.ts` / `exportDocx.ts` — writing-tool exporters.

## Roadmap (native-only, requires macOS host)

- On-device Creative-Commons LLM inference (llama.cpp) behind the existing model interface.
- Live text injection into Scrivener/Word via the macOS Accessibility API.
- Real-time audio tones for scene/chapter boundaries during dictation.

## License

MIT
