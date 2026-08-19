# SpeakFiction

**Dictation software built for fiction writers.** SpeakFiction turns spoken storytelling into
clean, structured manuscript prose and hands it off to Scrivener, Word, or Google Docs — with
per-book name libraries, genre-aware punctuation, spoken chapter/scene cues, and a private
on-device model that adapts to how *you* write.

The shipping targets are a **native macOS desktop app** and a **Windows x64 installer** (Electron
shell). The UI and the entire dictation "brain" are cross-platform TypeScript, so they run and are
fully testable on Linux/CI as well.

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
- **Guided integrations** — File export to Scrivener (RTF + split-on-import), Word, Google Docs, Markdown, and plain text. The Mac app can also **paste the manuscript into an open Scrivener or Word document** (Accessibility).

## Ethics

Genre base models are intended to be built **only** from public-domain and Creative-Commons
fiction — never from work authors weren't compensated for. The personal adaptation layer is
computed and stored entirely on the user's machine.

## Tech stack

- **Electron** desktop shell (macOS + Windows) — `electron/main.cjs`, `electron/preload.cjs`
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

Electron must be launched with `ELECTRON_RUN_AS_NODE` unset (`env -u ELECTRON_RUN_AS_NODE`). In Cursor, `npm run dev:electron` or `ELECTRON=1 ./node_modules/.bin/electron .` from the repo with Node on `PATH`.

### On-device speech models

Dictation uses local Whisper. Models are cached on disk under `models/` (gitignored) and are not re-downloaded if present:

- **Apple Silicon + whisper.cpp:** `models/ggml-large-v3-turbo.bin` (or medium/small) plus `models/bin/whisper-cli` with Metal.
- **Intel Mac / Windows + whisper.cpp:** CPU `whisper-small.en` or `whisper-medium.en` (≥16 GB RAM) when `whisper-cli` / `whisper-cli.exe` is present.
- **Fallback:** `@huggingface/transformers` English WASM models (`whisper-small.en` / `whisper-base.en`, fp32 — never q8). Chromium also caches these in Electron userData.

Hardware (arch, CPU cores, RAM, Metal) picks the model size, thread count, and whether the model stays resident. The Dictate screen shows the chosen path briefly (for example `Using large-v3-turbo · Metal · 8 threads`).

In a packaged Mac `.app`, `whisper-cli` ships inside the bundle. The Windows installer ships `whisper-cli.exe` when `models/bin-win-x64` is present (otherwise dictation uses WASM). GGML weights download on first dictation into the app userData folder (`~/Library/Application Support/SpeakFiction/models/` on Mac, `%APPDATA%\SpeakFiction\models\` on Windows) — not into the install directory.

## Package a macOS app

The distributable is a signed, notarized `.dmg` built with electron-builder. End users do not need Node, Homebrew, or a terminal. There are **two Mac installers**:

```bash
bash scripts/build-whisper-cli.sh              # Apple Silicon Metal whisper → models/bin/
ARCH=x86_64 FORCE=1 bash scripts/build-whisper-cli.sh  # Intel CPU whisper → models/bin-x64/
npm run pack:mac                               # Apple Silicon arm64 DMG (bumps patch)
npm run pack:mac:intel                         # Intel x64 DMG, same version/build as current
```

`pack:mac:intel` does not bump the marketing version — it produces `SpeakFiction-<version>-b<build>-x64.dmg` next to the arm64 file. Intel Macs use a lighter on-device model (`whisper-small.en`, or `medium.en` only with ≥16 GB RAM) on CPU. Metal and `large-v3-turbo` stay Apple Silicon only.

`npm run pack:mac:dir` writes an unpacked `.app` under `release/scratch/` (faster while iterating). `npm run pack:mac:all` builds both architectures after one version bump.

Without Apple signing credentials the build is unsigned and fine for local testing. For a Gatekeeper-friendly download:

1. Join the Apple Developer Program.
2. Install a **Developer ID Application** certificate in Keychain (or set `CSC_LINK` / `CSC_KEY_PASSWORD`).
3. Notarize by exporting either:
   - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, or
   - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
4. Re-run `npm run pack:mac`. The script enables notarization when those variables are set.

Each `npm run pack:mac` **bumps the patch version** (0.1.0 → 0.1.1), stamps a unique build number into the `.app`, and **keeps every DMG**:

`release/installers/SpeakFiction-0.1.1-b3-arm64.dmg`  
`release/installers/SpeakFiction-0.1.1-b3-x64.dmg`

Scratch output in `release/scratch/` is replaced each pack; `release/installers/` is the archive. Rebuild the same marketing version with `npm run pack:mac:same` (still a new `-bN` file). Use `PACK_VERSION=1.0.0` or `--bump=minor` / `--bump=major` when you want a different bump.

Drag **SpeakFiction** from the matching DMG (arm64 or Intel) into `/Applications`. The first dictation session downloads the Whisper weight that matches this Mac. The sidebar and **SpeakFiction → About** show the version.

Packaged builds run a **15-day full trial** from first launch, then require a one-time Polar license to dictate. Library, editing, and export stay available after the trial. Unpackaged `npm run dev:electron` skips the gate. Force it while developing with `SPEAKFICTION_LICENSE_GATE=1`.

## Polar license (one-time purchase)

SpeakFiction uses [Polar](https://polar.sh) as merchant of record. Polar emails the key; the app never ships a Polar API token.

1. Create an organization and a **one-time** product.
2. Add a **License Keys** benefit (`SF-` prefix, 3 device activations, no Polar expiry).
3. Create a **Checkout Link** for that product.
4. Set these when packing (or edit `electron/polarConfig.cjs`):

```bash
export POLAR_ORGANIZATION_ID=...
export POLAR_BENEFIT_ID=...          # optional; rejects keys from another Polar benefit
export POLAR_CHECKOUT_URL=https://...
export POLAR_SERVER=production       # or sandbox
```

Buy opens the Checkout Link in the browser. Paste the key Polar emailed. The app calls Polar’s customer-portal activate/validate APIs from the main process and stores `license.json` in Application Support / `%APPDATA%\SpeakFiction`. Offline, a licensed copy keeps working for 7 days.

Updates do not require a new key. The license file stays in userData when the app binary is replaced.

## In-app updates

Packaged builds check GitHub Releases about 8 seconds after launch, then every 12 hours. A sidebar banner appears while an update downloads and when it is ready. **Restart to install** is disabled while the microphone is listening so a dictation session is not killed. Quitting the app also applies a downloaded update.

electron-updater compares **semver** (`package.json` `version`), not `buildNumber`. Public updates must bump the marketing version (`npm run pack:mac` already does a patch bump).

Each GitHub Release that should update existing installs needs:

**Mac**
- `SpeakFiction-<version>-b<build>-arm64.zip` and `.blockmap`
- `SpeakFiction-<version>-b<build>-x64.zip` and `.blockmap`
- `latest-mac.yml` (merged when you `pack:mac:all`)

**Windows**
- `SpeakFiction-<version>-b<build>-win-x64.exe` and `.blockmap`
- `latest.yml`

The DMG remains the website installer; auto-update uses the zip (Mac) or NSIS exe (Windows). Pack scripts copy those files into `release/installers/` and pass `--publish never` so a local pack does not upload. Attach them when you create the GitHub Release.

Unpackaged `npm run dev:electron` skips updates. Force-off in a packaged build with `SPEAKFICTION_UPDATES=0`. Click the sidebar version to check immediately.

## Package a Windows installer

`npm run pack:win` builds a 64-bit NSIS installer (and a zip) **from macOS** — you do not need a Windows machine. It keeps the current marketing version and **increments `buildNumber`** so the Windows build is distinct from the last Mac pack (for example `0.1.1-b4` after a Mac `0.1.1-b3`). Artifacts land next to the Mac DMGs:

`release/installers/SpeakFiction-0.1.1-b4-win-x64.exe`  
`release/installers/SpeakFiction-0.1.1-b4-win-x64.zip`

```bash
npm run pack:win                 # same version, new build number, NSIS + zip
npm run pack:win:same            # same version *and* build number (overwrite that -bN)
# optional: --bump=patch|minor|major   also bump semver, then stamp a new build
```

Windows extraResources never include Mac Mach-O dylibs. If `models/bin-win-x64/whisper-cli.exe` exists (or can be downloaded from the official whisper.cpp `whisper-bin-x64` CPU release), it is shipped; otherwise the app uses the WASM fallback. Live send / Accessibility stay **Mac only** — Windows users export files to Scrivener, Word, or Google Docs. Microphone access uses Chromium `getUserMedia` (Settings → Privacy → Microphone).

`pack:mac`, `pack:mac:intel`, and `pack:mac:same` are unchanged.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server (renderer) |
| `npm run dev:electron` | Vite + Electron desktop shell |
| `npm test` | Run the Vitest unit suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Type-check + production renderer build |
| `npm run pack:mac` | Bump patch, Apple Silicon arm64 DMG under `release/installers/` |
| `npm run pack:mac:intel` | Intel x64 DMG, same version/build (CPU Whisper, lighter models) |
| `npm run pack:mac:all` | One bump, then arm64 + x64 installers |
| `npm run pack:mac:same` | Same marketing version, new build number and installer file |
| `npm run pack:mac:dir` | Unpacked `.app` only (still stamps a build number) |
| `npm run pack:win` | Windows x64 NSIS + zip; same version, new build number |
| `npm run pack:win:same` | Windows x64 installer, keep current version and build number |

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
- Real-time audio tones for scene/chapter boundaries during dictation.

## License

MIT
