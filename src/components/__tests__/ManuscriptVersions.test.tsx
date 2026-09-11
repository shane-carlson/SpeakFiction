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
});
