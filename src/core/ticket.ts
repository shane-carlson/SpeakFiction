export type TicketKind = 'support' | 'feature';

export interface TicketDraft {
  kind: TicketKind;
  summary: string;
  description: string;
  contactRequested: boolean;
  email: string;
}

export const TICKET_SUMMARY_MAX = 200;
export const TICKET_DESCRIPTION_MAX = 5000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isTicketKind(value: string): value is TicketKind {
  return value === 'support' || value === 'feature';
}

export function trimTicketField(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function ticketDialogCopy(kind: TicketKind): {
  title: string;
  sub: string;
  summaryLabel: string;
  descriptionLabel: string;
  descriptionHint: string;
  submitLabel: string;
} {
  if (kind === 'feature') {
    return {
      title: 'Request a feature',
      sub: 'Tell us what you want SpeakFiction to do.',
      summaryLabel: 'Summary',
      descriptionLabel: 'What you want',
      descriptionHint: 'What should it do, and why would it help?',
      submitLabel: 'Send request',
    };
  }
  return {
    title: 'Report a problem',
    sub: 'Tell us what went wrong. We read every ticket.',
    summaryLabel: 'Summary',
    descriptionLabel: 'What happened',
    descriptionHint: 'What you did, what you saw, and what you expected.',
    submitLabel: 'Send ticket',
  };
}

export function validateTicketDraft(
  input: Partial<TicketDraft> & { kind?: string },
): { ok: true; draft: TicketDraft } | { ok: false; message: string } {
  const kind = input.kind;
  if (!kind || !isTicketKind(kind)) {
    return { ok: false, message: 'Choose a support ticket or a feature request.' };
  }
  const summary = trimTicketField(input.summary, TICKET_SUMMARY_MAX);
  const description = trimTicketField(input.description, TICKET_DESCRIPTION_MAX);
  if (!summary) return { ok: false, message: 'Add a short summary.' };
  if (!description) return { ok: false, message: 'Add a description.' };

  const contactRequested = Boolean(input.contactRequested);
  const email = contactRequested ? trimTicketField(input.email, 200).toLowerCase() : '';
  if (contactRequested) {
    if (!email) return { ok: false, message: 'Add an email so we can reach you.' };
    if (!EMAIL_RE.test(email)) {
      return { ok: false, message: 'That email address does not look valid.' };
    }
  }

  return {
    ok: true,
    draft: {
      kind,
      summary,
      description,
      contactRequested,
      email,
    },
  };
}
