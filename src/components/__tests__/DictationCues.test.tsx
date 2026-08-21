import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DictationCues } from '../DictationCues';

describe('DictationCues', () => {
  it('shows grouped cues and can hide them', () => {
    const onOpenChange = vi.fn();
    render(<DictationCues open onOpenChange={onOpenChange} />);

    expect(screen.getByText('start dictation')).toBeVisible();
    expect(screen.getByText('new character')).toBeVisible();
    expect(screen.getByText(/Click Choose insertion point/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers Show cues when the list is hidden', () => {
    const onOpenChange = vi.fn();
    render(<DictationCues open={false} onOpenChange={onOpenChange} />);

    expect(screen.queryByText('start dictation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
