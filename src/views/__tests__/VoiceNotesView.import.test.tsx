import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_IMPORT_TOO_LARGE_MESSAGE, MAX_AUDIO_IMPORT_BYTES } from '../../core/audioImport';
import { draftText } from '../../core/dictationDraft';
import { useLicense } from '../../hooks/useLicense';
import { useStore } from '../../store';
import { VoiceNotesView } from '../VoiceNotesView';

vi.mock('../../core/localFiles', () => ({
  openBytesFile: vi.fn(),
  openTextFile: vi.fn(),
}));

vi.mock('../../core/transcribeAudioImport', () => ({
  transcribeImportedAudioFile: vi.fn(),
}));

import { openBytesFile } from '../../core/localFiles';
import { transcribeImportedAudioFile } from '../../core/transcribeAudioImport';

function manuscriptSnapshot() {
  return JSON.stringify(
    useStore.getState().books.map((book) => ({
      id: book.id,
      title: book.title,
      blocks: book.manuscript.blocks,
    })),
  );
}

function Harness({ onOpenDictate }: { onOpenDictate: () => void }) {
  const license = useLicense();
  const book = useStore((s) => s.books.find((item) => item.id === s.activeBookId) ?? s.books[0]);
  if (!book) return null;
  return <VoiceNotesView book={book} license={license} onOpenDictate={onOpenDictate} />;
}

describe('Voice notes audio import', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useStore.setState({ activeTab: 'notes', dictationDrafts: {} });
  });

  it('shows the size warning and leaves the book where it was', async () => {
    useStore.setState({ activeTab: 'notes' });
    const before = manuscriptSnapshot();
    const book = useStore.getState().books.find((item) => item.id === useStore.getState().activeBookId)!;
    vi.mocked(openBytesFile).mockResolvedValue({
      ok: false,
      path: 'huge-take.m4a',
      message: AUDIO_IMPORT_TOO_LARGE_MESSAGE,
    });
    const onOpenDictate = vi.fn();
    render(<Harness onOpenDictate={onOpenDictate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import audio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(AUDIO_IMPORT_TOO_LARGE_MESSAGE);
    expect(screen.getByText(book.title)).toBeVisible();
    expect(onOpenDictate).not.toHaveBeenCalled();
    expect(useStore.getState().activeTab).toBe('notes');
    expect(manuscriptSnapshot()).toBe(before);
    expect(vi.mocked(transcribeImportedAudioFile)).not.toHaveBeenCalled();
    expect(vi.mocked(openBytesFile)).toHaveBeenCalledWith(
      expect.objectContaining({
        maxBytes: MAX_AUDIO_IMPORT_BYTES,
        tooLargeMessage: AUDIO_IMPORT_TOO_LARGE_MESSAGE,
      }),
    );
  });

  it('shows the length warning and does not reset the manuscript', async () => {
    useStore.setState({ activeTab: 'notes' });
    const before = manuscriptSnapshot();
    vi.mocked(openBytesFile).mockResolvedValue({
      ok: true,
      path: 'long-take.m4a',
      bytes: new Uint8Array(32),
      mime: 'audio/mp4',
    });
    vi.mocked(transcribeImportedAudioFile).mockRejectedValue(
      new Error('That audio file is longer than 20 minutes. Split it into a shorter take and import that.'),
    );
    const onOpenDictate = vi.fn();
    render(<Harness onOpenDictate={onOpenDictate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import audio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/longer than 20 minutes/);
    expect(onOpenDictate).not.toHaveBeenCalled();
    expect(useStore.getState().activeTab).toBe('notes');
    expect(manuscriptSnapshot()).toBe(before);
  });

  it('lands a successful import in the project and keeps the manuscript', async () => {
    useStore.setState({ activeTab: 'notes', dictationDrafts: {} });
    const before = manuscriptSnapshot();
    const bookId = useStore.getState().activeBookId!;
    vi.mocked(openBytesFile).mockResolvedValue({
      ok: true,
      path: 'scene.wav',
      bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
      mime: 'audio/wav',
    });
    vi.mocked(transcribeImportedAudioFile).mockResolvedValue({
      text: 'the wind howled',
      durationMs: 1200,
    });
    const onOpenDictate = vi.fn(() => useStore.getState().setActiveTab('dictate'));
    render(<Harness onOpenDictate={onOpenDictate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import audio' }));

    await waitFor(() => {
      expect(draftText(useStore.getState().dictationDrafts[bookId] ?? [])).toMatch(/wind howled/i);
    });
    expect(onOpenDictate).toHaveBeenCalled();
    expect(manuscriptSnapshot()).toBe(before);
    expect(useStore.getState().books.find((item) => item.id === bookId)?.title).toBeTruthy();
  });
});
