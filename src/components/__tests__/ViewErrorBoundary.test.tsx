import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ViewErrorBoundary } from '../ViewErrorBoundary';

function Boom(): ReactNode {
  throw new Error('library crashed');
}

describe('ViewErrorBoundary', () => {
  it('shows a retry instead of a blank page', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ViewErrorBoundary title="Library could not open" hint="Your books are still on this machine.">
        <Boom />
      </ViewErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Library could not open');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    spy.mockRestore();
  });
});
