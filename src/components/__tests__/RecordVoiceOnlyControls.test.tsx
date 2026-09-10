import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RECORD_VOICE_ONLY_LABEL, REMOTE_VOICE_TAKE_PLACEHOLDER, type VoiceNote } from '../../core/voiceNotes';
import { RecordVoiceOnlyControls } from '../RecordVoiceOnlyControls';
import { VoiceNoteRow } from '../../views/VoiceNotesView';

describe('RecordVoiceOnlyControls', () => {
  it('labels the compact shortcut Record Voice Only', () => {
    const onToggle = vi.fn();
    render(
      <RecordVoiceOnlyControls
        compact
        recording={false}
        elapsedMs={0}
        level={0}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: RECORD_VOICE_ONLY_LABEL }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('VoiceNoteRow book picker', () => {
  it('lets you choose which book a voice-only take is added to', () => {
    const onAssignBook = vi.fn();
    const note: VoiceNote = {
      id: 'vn_1',
      createdAt: '2026-09-10T00:00:00.000Z',
      durationMs: 1200,
      platform: 'desktop',
      text: REMOTE_VOICE_TAKE_PLACEHOLDER,
      bookId: 'bk-a',
      bookHint: 'Ash',
      status: 'inbox',
      source: 'desktop',
      hasAudio: false,
      recordOnly: true,
    };
    render(
      <ul>
        <VoiceNoteRow
          note={note}
          books={[
            { id: 'bk-a', title: 'Ash' },
            { id: 'bk-b', title: 'Ember' },
          ]}
          onAssignBook={onAssignBook}
        />
      </ul>,
    );

    const select = screen.getByRole('combobox', { name: 'Book for this take' });
    expect(select).toHaveValue('bk-a');
    fireEvent.change(select, { target: { value: 'bk-b' } });
    expect(onAssignBook).toHaveBeenCalledWith({ id: 'bk-b', title: 'Ember' });
  });
});
