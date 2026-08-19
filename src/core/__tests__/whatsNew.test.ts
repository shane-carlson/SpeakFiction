import { describe, expect, it, vi } from 'vitest';
import {
  appVersionId,
  bundledWhatsNew,
  DEFAULT_WHATS_NEW,
  fetchGithubReleaseNotes,
  githubReleaseApiUrl,
  githubReleaseCandidateUrls,
  githubReleaseTag,
  notesMatchVersion,
  normalizeReleaseNotes,
  parseReleaseNotes,
  pendingNotesIndicateUpdate,
  releaseTagMatches,
  resolveWhatsNewNotes,
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

  it('prefers pending updater notes, then GitHub, then bundled copy', async () => {
    const pending = await resolveWhatsNewNotes({
      version: '0.1.6',
      build: 11,
      pending: { version: '0.1.6', notes: 'From the downloaded update.' },
    });
    expect(pending).toEqual({ text: 'From the downloaded update.', source: 'pending' });

    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('v0.1.6-b11')) {
        return {
          ok: true,
          json: async () => ({ tag_name: 'v0.1.6-b11', body: 'GitHub body' }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const github = await resolveWhatsNewNotes({ version: '0.1.6', build: 11, fetchImpl });
    expect(github).toEqual({ text: 'GitHub body', source: 'github' });

    const fail = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const bundled = await resolveWhatsNewNotes({ version: '0.1.6', build: 11, fetchImpl: fail });
    expect(bundled.source).toBe('bundled');
    expect(bundled.text).toBe(bundledWhatsNew('0.1.6'));
    expect(bundledWhatsNew('9.9.9')).toBe(DEFAULT_WHATS_NEW);
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
