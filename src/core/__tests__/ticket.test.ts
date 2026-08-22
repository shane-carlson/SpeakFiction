import { describe, expect, it } from 'vitest';
import { ticketDialogCopy, validateTicketDraft } from '../ticket';

describe('validateTicketDraft', () => {
  it('requires a summary and description', () => {
    expect(validateTicketDraft({ kind: 'support', summary: '  ', description: 'Broke' })).toEqual({
      ok: false,
      message: 'Add a short summary.',
    });
    expect(validateTicketDraft({ kind: 'feature', summary: 'Dark mode', description: '' })).toEqual({
      ok: false,
      message: 'Add a description.',
    });
  });

  it('omits email unless the writer asked to be contacted', () => {
    const result = validateTicketDraft({
      kind: 'support',
      summary: 'Mic failed',
      description: 'The meter never moved.',
      contactRequested: false,
      email: 'writer@example.com',
    });
    expect(result).toEqual({
      ok: true,
      draft: {
        kind: 'support',
        summary: 'Mic failed',
        description: 'The meter never moved.',
        contactRequested: false,
        email: '',
      },
    });
  });

  it('requires a valid email only when contact is requested', () => {
    expect(
      validateTicketDraft({
        kind: 'feature',
        summary: 'Scene cards',
        description: 'Pin a scene while dictating.',
        contactRequested: true,
        email: '',
      }),
    ).toEqual({ ok: false, message: 'Add an email so we can reach you.' });

    expect(
      validateTicketDraft({
        kind: 'feature',
        summary: 'Scene cards',
        description: 'Pin a scene while dictating.',
        contactRequested: true,
        email: 'not-an-email',
      }),
    ).toEqual({ ok: false, message: 'That email address does not look valid.' });

    expect(
      validateTicketDraft({
        kind: 'feature',
        summary: 'Scene cards',
        description: 'Pin a scene while dictating.',
        contactRequested: true,
        email: ' Writer@Example.com ',
      }),
    ).toEqual({
      ok: true,
      draft: {
        kind: 'feature',
        summary: 'Scene cards',
        description: 'Pin a scene while dictating.',
        contactRequested: true,
        email: 'writer@example.com',
      },
    });
  });
});

describe('ticketDialogCopy', () => {
  it('uses distinct titles for support and feature requests', () => {
    expect(ticketDialogCopy('support').title).toBe('Report a problem');
    expect(ticketDialogCopy('feature').title).toBe('Request a feature');
  });
});
