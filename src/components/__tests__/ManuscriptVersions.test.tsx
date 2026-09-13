import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManuscriptVersionPreview } from '../ManuscriptVersionPreview';
import { ManuscriptToolbar } from '../ManuscriptToolbar';
import { ManuscriptSelectBanner } from '../ManuscriptSelectBanner';

describe('ManuscriptVersionPreview', () => {
  it('renders chapter titles and paragraph text for review', () => {
    render(
      <ManuscriptVersionPreview
        blocks={[
          { id: 'c1', type: 'chapter', title: 'The Gate' },
          { id: 'p1', type: 'paragraph', text: 'The wind howled.' },
        ]}
      />,
    );
    expect(screen.getByText('CHAPTER 1')).toBeInTheDocument();
    expect(screen.getByText('The Gate')).toBeInTheDocument();
    expect(screen.getByText('The wind howled.')).toBeInTheDocument();
  });
});

describe('ManuscriptToolbar versions', () => {
  it('opens manuscript versions from the toolbar', () => {
    const onOpenVersions = vi.fn();
    render(
      <ManuscriptToolbar
        canUndo={false}
        canRedo={false}
        editorOpen={false}
        onToggleEditor={() => undefined}
        onInsertStructure={() => undefined}
        onInsertImage={() => undefined}
        onInsertTable={() => undefined}
        onFormat={() => undefined}
        onClearFormat={() => undefined}
        onSetKind={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onOpenVersions={onOpenVersions}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    expect(onOpenVersions).toHaveBeenCalledTimes(1);
  });

  it('labels Select paragraphs and keeps Combine and Delete off the toolbar', () => {
    const onToggleSelecting = vi.fn();
    render(
      <ManuscriptToolbar
        canUndo={false}
        canRedo={false}
        editorOpen={false}
        onToggleEditor={() => undefined}
        onInsertStructure={() => undefined}
        onInsertImage={() => undefined}
        onInsertTable={() => undefined}
        onFormat={() => undefined}
        onClearFormat={() => undefined}
        onSetKind={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onToggleSelecting={onToggleSelecting}
        selecting={false}
      />,
    );
    const selectBtn = screen.getByRole('button', { name: 'Select paragraphs' });
    expect(selectBtn).toHaveAttribute(
      'title',
      'Use this to select paragraphs to combine or delete',
    );
    fireEvent.click(selectBtn);
    expect(onToggleSelecting).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Actions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Combine' })).not.toBeInTheDocument();
  });
});

describe('ManuscriptSelectBanner', () => {
  it('shows Combine and Delete at the top of the manuscript', () => {
    const onCombine = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <ManuscriptSelectBanner count={0} onCombine={onCombine} onDelete={onDelete} />,
    );
    expect(screen.getByText('Select paragraphs to combine or delete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combine' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    rerender(<ManuscriptSelectBanner count={1} onCombine={onCombine} onDelete={onDelete} />);
    expect(screen.getByText('1 paragraph selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Combine' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();

    rerender(<ManuscriptSelectBanner count={2} onCombine={onCombine} onDelete={onDelete} />);
    expect(screen.getByText('2 paragraphs selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Combine' }));
    expect(onCombine).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
