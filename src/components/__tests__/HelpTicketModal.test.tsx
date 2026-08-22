import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpTicketModal } from '../HelpTicketModal';

describe('HelpTicketModal', () => {
  it('hides the email field until the writer asks to be contacted', () => {
    render(<HelpTicketModal kind="support" onClose={() => undefined} />);
    expect(screen.queryByLabelText('Email')).toBeNull();
    fireEvent.click(screen.getByLabelText('Contact me about this'));
    expect(screen.getByLabelText('Email')).toBeVisible();
  });

  it('does not send email when contact is left unchecked', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<HelpTicketModal kind="feature" onClose={() => undefined} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Scene cards' } });
    fireEvent.change(screen.getByLabelText('What you want'), {
      target: { value: 'Pin a scene while dictating.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'feature',
      summary: 'Scene cards',
      description: 'Pin a scene while dictating.',
      contactRequested: false,
      email: '',
    });
  });

  it('requires email after the contact checkbox is on', async () => {
    const onSubmit = vi.fn();
    render(<HelpTicketModal kind="support" onClose={() => undefined} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Mic failed' } });
    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'The meter never moved.' },
    });
    fireEvent.click(screen.getByLabelText('Contact me about this'));
    fireEvent.click(screen.getByRole('button', { name: 'Send ticket' }));
    expect(await screen.findByText('Add an email so we can reach you.')).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
