import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { offsetsFromDomRange, plainDraft } from '../../core/dictationDraft';
import { DictationTranscript, TRANSCRIPT_INSERT_HINT } from '../DictationTranscript';

describe('DictationTranscript insert pin', () => {
  it('shows a hover hint when the caret is not at the end', () => {
    render(
      <DictationTranscript
        id="dictation-transcription"
        value={plainDraft('Hello. World.')}
        onChange={vi.fn()}
        caret={7}
      />,
    );

    expect(screen.getByRole('note', { name: TRANSCRIPT_INSERT_HINT })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('note', { name: TRANSCRIPT_INSERT_HINT }).parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(TRANSCRIPT_INSERT_HINT);

    fireEvent.mouseLeave(screen.getByRole('note', { name: TRANSCRIPT_INSERT_HINT }).parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not show an insert pin when the caret is at the end', () => {
    render(
      <DictationTranscript
        id="dictation-transcription"
        value={plainDraft('Hello.')}
        onChange={vi.fn()}
        caret={6}
      />,
    );

    expect(screen.queryByRole('note', { name: TRANSCRIPT_INSERT_HINT })).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('textbox'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('restores the caret after rewriting HTML so the next insert continues forward', () => {
    const onCaretChange = vi.fn();
    const { rerender } = render(
      <DictationTranscript
        id="dictation-transcription"
        value={plainDraft('Hello. World.')}
        onChange={vi.fn()}
        caret={7}
        onCaretChange={onCaretChange}
      />,
    );

    const box = screen.getByRole('textbox');
    box.focus();
    onCaretChange.mockClear();

    rerender(
      <DictationTranscript
        id="dictation-transcription"
        value={plainDraft('Hello. One. World.')}
        onChange={vi.fn()}
        caret={12}
        onCaretChange={onCaretChange}
      />,
    );

    const sel = window.getSelection();
    expect(sel && sel.rangeCount > 0).toBe(true);
    const { start } = offsetsFromDomRange(box, sel!.getRangeAt(0));
    expect(start).toBe(12);
    expect(onCaretChange).not.toHaveBeenCalledWith(7);
  });
});
