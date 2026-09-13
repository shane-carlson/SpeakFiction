import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManuscriptVersionPreview } from '../ManuscriptVersionPreview';
import { ManuscriptToolbar } from '../ManuscriptToolbar';

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

  it('shows Actions after Select, then Combine and Delete', () => {
    const onToggleSelecting = vi.fn();
    const onCombine = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
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
        selectedParagraphCount={0}
        onCombineParagraphs={onCombine}
        onDeleteParagraphs={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(onToggleSelecting).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Actions/ })).not.toBeInTheDocument();

    rerender(
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
        selecting
        selectedParagraphCount={2}
        onCombineParagraphs={onCombine}
        onDeleteParagraphs={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for 2 selected paragraphs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Combine' }));
    expect(onCombine).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for 2 selected paragraphs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
