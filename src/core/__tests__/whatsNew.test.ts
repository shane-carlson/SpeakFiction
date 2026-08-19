import { describe, expect, it, vi } from 'vitest';
import {
  appVersionId,
  bundledWhatsNew,
  DEFAULT_WHATS_NEW,
  featureBullets,
  fetchGithubReleaseNotes,
  githubReleaseApiUrl,
  githubReleaseCandidateUrls,
  githubReleaseTag,
  hasCuratedWhatsNew,
  notesMatchVersion,
  normalizeReleaseNotes,
  parseReleaseNotes,
  pendingNotesIndicateUpdate,
  releaseTagMatches,
  resolveWhatsNewNotes,
  sanitizeWhatsNewNotes,
  shouldRecordLastSeenOnLaunch,
  shouldShowWhatsNew,
} from '../whatsNew';

describe('shouldShowWhatsNew', () => {
  it('does not show on a true first install', () => {
    expect(shouldShowWhatsNew(null, '0.1.7-b12')).toBe(false);
    expect(shouldShowWhatsNew(undefined, '0.1.7-b12')).toBe(false);
    expect(shouldShowWhatsNew('', '0.1.7-b12')).toBe(false);
    expect(shouldShowWhatsNew('   ', '0.1.7-b12')).toBe(false);
  });

  it('shows an upgrade that never wrote lastSeenVersion', () => {
    expect(shouldShowWhatsNew(null, '0.1.7-b12', { hasPriorSession: true })).toBe(true);
    expect(shouldShowWhatsNew(undefined, '0.1.7-b12', { hasPriorSession: true })).toBe(true);
    expect(shouldShowWhatsNew('', '0.1.7-b12', { hasPriorSession: true })).toBe(true);
  });

  it('shows when pending updater notes are present after restart', () => {
    expect(shouldShowWhatsNew(null, '0.1.7-b12', { hasPendingNotes: true })).toBe(true);
    expect(shouldShowWhatsNew('0.1.6-b11', '0.1.7-b12', { hasPendingNotes: true })).toBe(true);
  });

  it('does not show when the running version was already seen', () => {
    expect(shouldShowWhatsNew('0.1.7-b12', '0.1.7-b12')).toBe(false);
    expect(shouldShowWhatsNew('0.1.7-b12', '0.1.7-b12', { hasPriorSession: true, hasPendingNotes: true })).toBe(
      false,
    );
  });

  it('shows after a version bump until the user dismisses', () => {
    expect(shouldShowWhatsNew('0.1.5-b10', '0.1.6-b11')).toBe(true);
    expect(shouldShowWhatsNew('0.1.6-b10', '0.1.6-b11')).toBe(true);
    expect(shouldShowWhatsNew('0.1.6-b11', '0.1.7-b12')).toBe(true);
  });

  it('never shows without a current version', () => {
    expect(shouldShowWhatsNew('0.1.5', '')).toBe(false);
    expect(shouldShowWhatsNew(null, '', { hasPriorSession: true, hasPendingNotes: true })).toBe(false);
  });
});

describe('shouldRecordLastSeenOnLaunch', () => {
  it('records the running version on a true first install', () => {
    expect(shouldRecordLastSeenOnLaunch(null, '0.1.7-b12')).toBe(true);
    expect(shouldRecordLastSeenOnLaunch(null, '0.1.7-b12', { hasPriorSession: false })).toBe(true);
  });

  it('does not record on first paint of an upgrade', () => {
    expect(shouldRecordLastSeenOnLaunch(null, '0.1.7-b12', { hasPriorSession: true })).toBe(false);
    expect(shouldRecordLastSeenOnLaunch(null, '0.1.7-b12', { hasPendingNotes: true })).toBe(false);
    expect(shouldRecordLastSeenOnLaunch('0.1.6-b11', '0.1.7-b12')).toBe(false);
  });

  it('does not overwrite a version that was already acknowledged', () => {
    expect(shouldRecordLastSeenOnLaunch('0.1.7-b12', '0.1.7-b12')).toBe(false);
  });
});

describe('pendingNotesIndicateUpdate', () => {
  it('treats a saved updater notes file as an upgrade restart', () => {
    expect(pendingNotesIndicateUpdate(null)).toBe(false);
    expect(pendingNotesIndicateUpdate(undefined)).toBe(false);
    expect(pendingNotesIndicateUpdate({ version: '0.1.8', notes: 'Fixes' })).toBe(true);
    expect(pendingNotesIndicateUpdate({ version: '0.1.8', notes: '' })).toBe(true);
  });
});

describe('appVersionId', () => {
  it('joins marketing version and build', () => {
    expect(appVersionId('0.1.6', 11)).toBe('0.1.6-b11');
    expect(appVersionId('v0.1.6', '11')).toBe('0.1.6-b11');
    expect(appVersionId('0.1.6', 0)).toBe('0.1.6');
    expect(appVersionId('0.1.6', '')).toBe('0.1.6');
  });
});

describe('release notes sources', () => {
  it('builds GitHub tag URLs like v0.1.6-b11', () => {
    expect(githubReleaseTag('0.1.6', 11)).toBe('v0.1.6-b11');
    expect(githubReleaseApiUrl('0.1.6', 11)).toBe(
      'https://api.github.com/repos/shane-carlson/SpeakFiction/releases/tags/v0.1.6-b11',
    );
    expect(githubReleaseCandidateUrls('0.1.6', 11)[0]).toContain('v0.1.6-b11');
  });

  it('matches pending notes to the running marketing version', () => {
    expect(notesMatchVersion('0.1.6', '0.1.6-b11')).toBe(true);
    expect(notesMatchVersion('v0.1.6-b11', '0.1.6')).toBe(true);
    expect(notesMatchVersion('0.1.5', '0.1.6-b11')).toBe(false);
  });

  it('matches a GitHub tag to the running version', () => {
    expect(releaseTagMatches('v0.1.6-b11', '0.1.6', 11)).toBe(true);
    expect(releaseTagMatches('v0.1.6-b11', '0.1.6', 10)).toBe(true);
    expect(releaseTagMatches('v0.1.7-b1', '0.1.6', 11)).toBe(false);
  });

  it('flattens updater releaseNotes strings and arrays', () => {
    expect(normalizeReleaseNotes('  Hello  ')).toBe('Hello');
    expect(normalizeReleaseNotes([{ version: '0.1.6', note: 'One' }, { version: '0.1.5', note: 'Two' }])).toBe(
      'One\n\nTwo',
    );
    expect(normalizeReleaseNotes(null)).toBe('');
  });

  it('parses headings and lists without a markdown library', () => {
    const blocks = parseReleaseNotes(
      '## Fixes\n\n- Session restore\n- In-app updates\n\nThanks for writing.\n\n1. First\n2. Second',
    );
    expect(blocks).toEqual([
      { type: 'heading', level: 2, text: 'Fixes' },
      { type: 'list', items: ['Session restore', 'In-app updates'] },
      { type: 'paragraph', text: 'Thanks for writing.' },
      { type: 'list', items: ['First', 'Second'] },
    ]);
  });

  it('keeps only feature bullets and drops pack/ops sections', () => {
    const sanitized = sanitizeWhatsNewNotes(`
## Features
- Strike last sentence in the dictation box
- Less silence junk without eating the next sentence

## Pack
- Notarized DMG via stapler
- Attach latest.yml

## Mac
- Apple Silicon Metal vs Intel whisper-small.en

## Windows
- NSIS installer

## Site
- Copy SpeakFiction-0.1.9.dmg
`);
    expect(featureBullets(sanitized)).toEqual([
      'Strike last sentence in the dictation box',
      'Less silence junk without eating the next sentence',
    ]);
  });

  it('uses curated 0.2.3 bullets even when pending GitHub notes are pack/ops copy', async () => {
    expect(hasCuratedWhatsNew('0.2.3')).toBe(true);
    const resolved = await resolveWhatsNewNotes({
      version: '0.2.3',
      build: 18,
      pending: {
        version: '0.2.3',
        notes: '## Pack\n- Notarized DMG\n- stapler\n\n## Features\n- Ignore this GitHub wall',
      },
    });
    expect(resolved.source).toBe('bundled');
    expect(resolved.text).toBe(bundledWhatsNew('0.2.3'));
    expect(featureBullets(resolved.text)).toEqual([
      'Windows app icon and taskbar show the SpeakFiction logo',
    ]);
  });

  it('uses curated 0.2.2 bullets even when pending GitHub notes are pack/ops copy', async () => {
    expect(hasCuratedWhatsNew('0.2.2')).toBe(true);
    const resolved = await resolveWhatsNewNotes({
      version: '0.2.2',
      build: 17,
      pending: {
        version: '0.2.2',
        notes: '## Pack\n- Notarized DMG\n- stapler\n\n## Features\n- Ignore this GitHub wall',
      },
    });
    expect(resolved.source).toBe('bundled');
    expect(resolved.text).toBe(bundledWhatsNew('0.2.2'));
    expect(featureBullets(resolved.text)).toEqual([
      'Insert dictation at the cursor without wiping the transcription box',
      'Struck and unstruck text stay in the box so you can insert again or keep editing',
      'Native Mac title bar with traffic lights, drag-to-move, and double-click zoom',
    ]);
  });

  it('uses curated 0.2.1 bullets even when pending GitHub notes are pack/ops copy', async () => {
    expect(hasCuratedWhatsNew('0.2.1')).toBe(true);
    const resolved = await resolveWhatsNewNotes({
      version: '0.2.1',
      build: 16,
      pending: {
        version: '0.2.1',
        notes: '## Pack\n- Notarized DMG\n- stapler\n\n## Features\n- Ignore this GitHub wall',
      },
    });
    expect(resolved.source).toBe('bundled');
    expect(resolved.text).toBe(bundledWhatsNew('0.2.1'));
    expect(featureBullets(resolved.text)).toEqual([
      'Right-click the transcription box to strike text or turn a selection into a chapter, scene, or section title',
      'Insert dictation between manuscript blocks so new lines land where you want them',
      'Structure cues sit at the top of the caret menu so new chapter, scene, and paragraph are one click away',
    ]);
  });

  it('uses curated 0.2.0 bullets even when pending GitHub notes are pack/ops copy', async () => {
    expect(hasCuratedWhatsNew('0.2.0')).toBe(true);
    const resolved = await resolveWhatsNewNotes({
      version: '0.2.0',
      build: 15,
      pending: {
        version: '0.2.0',
        notes: '## Pack\n- Notarized DMG\n- stapler\n\n## Features\n- Ignore this GitHub wall',
      },
    });
    expect(resolved.source).toBe('bundled');
    expect(resolved.text).toBe(bundledWhatsNew('0.2.0'));
    expect(featureBullets(resolved.text)).toEqual([
      'Dictation hears more of what you say, including quiet lines',
      'Spoken cues (new chapter, new scene, new paragraph) reach the box again',
      'What’s New is a short list of features, not installer notes',
    ]);
  });

  it('uses curated bullets even when pending GitHub notes are pack/ops copy', async () => {
    expect(hasCuratedWhatsNew('0.1.9')).toBe(true);
    const resolved = await resolveWhatsNewNotes({
      version: '0.1.9',
      build: 20,
      pending: {
        version: '0.1.9',
        notes: '## Pack\n- Notarized DMG\n- stapler\n\n## Features\n- Ignore this GitHub wall',
      },
    });
    expect(resolved.source).toBe('bundled');
    expect(resolved.text).toBe(bundledWhatsNew('0.1.9'));
    expect(featureBullets(resolved.text)).toEqual([
      'Strike last sentence in the dictation box — keep the line visible, leave it out of the manuscript',
      'Less silence junk (“no, no”) without eating the next sentence',
      'Struck drafts stay in the box so you can still see what you dropped',
      'The box is labeled Transcription so it is clear what you are editing',
    ]);
  });

  it('sanitizes pending notes for versions without curated copy', async () => {
    const pending = await resolveWhatsNewNotes({
      version: '9.9.9',
      build: 1,
      pending: {
        version: '9.9.9',
        notes: '## Features\n- New outline view so scenes are easier to jump between\n\n## Pack\n- Notarized DMG',
      },
    });
    expect(pending).toEqual({
      text: '- New outline view so scenes are easier to jump between',
      source: 'pending',
    });
  });

  it('sanitizes GitHub notes when there is no curated copy or usable pending body', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('v9.9.9')) {
        return {
          ok: true,
          json: async () => ({
            tag_name: 'v9.9.9-b1',
            body: '## Features\n- Faster export so you can get the manuscript out\n\n## Windows\n- NSIS installer',
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const github = await resolveWhatsNewNotes({ version: '9.9.9', build: 1, fetchImpl });
    expect(github).toEqual({
      text: '- Faster export so you can get the manuscript out',
      source: 'github',
    });
  });

  it('falls back to default bullets when pending and GitHub are pack/ops only', async () => {
    const fail = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const bundled = await resolveWhatsNewNotes({
      version: '9.9.9',
      build: 1,
      pending: { version: '9.9.9', notes: '## Pack\n- Notarized DMG via stapler' },
      fetchImpl: fail,
    });
    expect(bundled.source).toBe('bundled');
    expect(bundled.text).toBe(DEFAULT_WHATS_NEW);
    expect(bundledWhatsNew('9.9.9')).toBe(DEFAULT_WHATS_NEW);
    expect(featureBullets(DEFAULT_WHATS_NEW).length).toBeGreaterThanOrEqual(3);
  });

  it('skips latest GitHub release notes for a different version', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith('/releases/latest')) {
        return {
          ok: true,
          json: async () => ({ tag_name: 'v0.1.7-b1', body: 'Newer release' }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;
    await expect(fetchGithubReleaseNotes('0.1.6', 11, fetchImpl)).resolves.toBeNull();
  });
});
