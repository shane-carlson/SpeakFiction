import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChapterRemoveControl } from '../ChapterRemoveControl';
import { CHAPTER_DELETE_LABEL, CHAPTER_UNWRAP_LABEL } from '../../core/manuscriptContextMenu';

describe('ChapterRemoveControl', () => {
  it('shows both chapter actions on X hover and calls unwrap vs delete', () => {
    const onUnwrap = vi.fn();
    const onDelete = vi.fn();
    render(<ChapterRemoveControl onUnwrap={onUnwrap} onDelete={onDelete} />);

    expect(screen.queryByRole('menuitem', { name: CHAPTER_UNWRAP_LABEL })).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Chapter remove options' }));
    expect(screen.getByRole('menuitem', { name: CHAPTER_UNWRAP_LABEL })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: CHAPTER_DELETE_LABEL })).toBeVisible();

    fireEvent.click(screen.getByRole('menuitem', { name: CHAPTER_UNWRAP_LABEL }));
    expect(onUnwrap).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('deletes the chapter range from the hover flyout', () => {
    const onUnwrap = vi.fn();
    const onDelete = vi.fn();
    render(<ChapterRemoveControl onUnwrap={onUnwrap} onDelete={onDelete} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Chapter remove options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: CHAPTER_DELETE_LABEL }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onUnwrap).not.toHaveBeenCalled();
  });
});
