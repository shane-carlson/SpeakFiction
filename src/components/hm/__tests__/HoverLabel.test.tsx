import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HoverLabel } from '../HoverLabel';
import { IconChapter, ToolbarIconButton } from '../ManuscriptToolbarIcons';

describe('HoverLabel', () => {
  it('shows the toolbar button function beside the control', () => {
    render(
      <>
        <ToolbarIconButton label="Insert chapter" onClick={() => {}}>
          <IconChapter />
        </ToolbarIconButton>
        <HoverLabel />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Insert chapter' });
    expect(button).toHaveAttribute('data-tooltip', 'Insert chapter');
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerOver(button);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Insert chapter');
    expect(tip).toHaveClass('hover-label');

    fireEvent.pointerOut(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not show a label on a disabled control', () => {
    render(
      <>
        <ToolbarIconButton label="Undo last change" disabled onClick={() => {}}>
          <IconChapter />
        </ToolbarIconButton>
        <HoverLabel />
      </>,
    );

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Undo last change' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
