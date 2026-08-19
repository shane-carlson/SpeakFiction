import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appVersionId, bundledWhatsNew } from '../../core/whatsNew';
import { useStore } from '../../store';
import { useWhatsNew } from '../useWhatsNew';

vi.mock('../../core/sessionStorage', async () => {
  const actual = await vi.importActual<typeof import('../../core/sessionStorage')>('../../core/sessionStorage');
  return {
    ...actual,
    hasPersistedSession: vi.fn(() => false),
  };
});

import { hasPersistedSession } from '../../core/sessionStorage';

const currentVersion = appVersionId(__APP_VERSION__, __APP_BUILD__);
const hasPersistedSessionMock = vi.mocked(hasPersistedSession);

function mockPending(pending: { version: string; notes: string } | null) {
  window.speakfiction = {
    platform: 'darwin',
    version: __APP_VERSION__,
    whatsNew: {
      getPending: vi.fn(async () => pending),
      clearPending: vi.fn(async () => ({ ok: true })),
    },
  };
}

describe('useWhatsNew', () => {
  beforeEach(async () => {
    localStorage.clear();
    hasPersistedSessionMock.mockReturnValue(false);
    mockPending(null);
    useStore.setState({ lastSeenVersion: null });
    await useStore.persist.rehydrate();
    useStore.setState({ lastSeenVersion: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete window.speakfiction;
  });

  it('does not show on a true first install and remembers the version', async () => {
    const { result } = renderHook(() => useWhatsNew());
    expect(result.current.open).toBe(false);
    await waitFor(() => {
      expect(useStore.getState().lastSeenVersion).toBe(currentVersion);
    });
    expect(result.current.open).toBe(false);
  });

  it('shows an upgrade from a missing lastSeenVersion when a library session exists', async () => {
    hasPersistedSessionMock.mockReturnValue(true);
    const { result } = renderHook(() => useWhatsNew());
    expect(result.current.open).toBe(true);
    expect(useStore.getState().lastSeenVersion).toBeNull();
    await act(async () => {
      result.current.dismiss();
    });
    expect(useStore.getState().lastSeenVersion).toBe(currentVersion);
    expect(window.speakfiction?.whatsNew?.clearPending).toHaveBeenCalled();
  });

  it('shows when pending updater notes are present', async () => {
    mockPending({ version: '0.1.7', notes: 'From the downloaded update.' });
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => {
      expect(result.current.open).toBe(true);
    });
    expect(useStore.getState().lastSeenVersion).toBeNull();
  });

  it('shows curated feature bullets instead of pending GitHub pack notes', async () => {
    hasPersistedSessionMock.mockReturnValue(true);
    mockPending({
      version: __APP_VERSION__,
      notes: '## Pack\n- Notarized DMG via stapler\n\n## Features\n- Ignore this GitHub wall',
    });
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => {
      expect(result.current.open).toBe(true);
      expect(result.current.notes).toBe(bundledWhatsNew(__APP_VERSION__));
    });
    expect(result.current.notes).not.toContain('Notarized');
    expect(result.current.notes).not.toContain('Ignore this GitHub wall');
  });

  it('does not show when the running version was already acknowledged', async () => {
    useStore.setState({ lastSeenVersion: currentVersion });
    hasPersistedSessionMock.mockReturnValue(true);
    mockPending({ version: __APP_VERSION__, notes: 'Already seen.' });
    const { result } = renderHook(() => useWhatsNew());
    expect(result.current.open).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.open).toBe(false);
    expect(useStore.getState().lastSeenVersion).toBe(currentVersion);
  });
});
