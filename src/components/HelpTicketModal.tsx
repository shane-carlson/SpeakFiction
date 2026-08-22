import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ticketDialogCopy,
  validateTicketDraft,
  type TicketDraft,
  type TicketKind,
} from '../core/ticket';

export function HelpTicketModal({
  kind,
  onClose,
  onSubmit,
}: {
  kind: TicketKind | null;
  onClose: () => void;
  onSubmit?: (draft: TicketDraft) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [contactRequested, setContactRequested] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!kind) return;
    setSummary('');
    setDescription('');
    setContactRequested(false);
    setEmail('');
    setBusy(false);
    setError('');
    setSent(false);
    const timer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [kind]);

  useEffect(() => {
    if (!kind) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, onClose]);

  if (!kind) return null;

  const copy = ticketDialogCopy(kind);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const checked = validateTicketDraft({
      kind,
      summary,
      description,
      contactRequested,
      email,
    });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError('');
    const send =
      onSubmit ??
      ((draft: TicketDraft) =>
        window.speakfiction?.help?.submitTicket(draft) ??
        Promise.resolve({
          ok: false,
          message: 'Support is only available in the SpeakFiction app.',
        }));
    const result = await send(checked.draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Could not send. Try again.');
      return;
    }
    setSent(true);
  };

  return (
    <div className="whats-new-overlay" onClick={onClose} role="presentation">
      <div
        className="card whats-new-dialog help-ticket-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-ticket-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="whats-new-head">
          <div>
            <h3 id="help-ticket-title">{copy.title}</h3>
            <p className="sub">{copy.sub}</p>
          </div>
          <button type="button" className="btn ghost compact" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {sent ? (
          <div className="help-ticket-done">
            <p>Sent. Thank you.</p>
            <button type="button" className="btn primary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="help-ticket-form" onSubmit={(event) => void submit(event)}>
            <label>
              {copy.summaryLabel}
              <input
                ref={firstFieldRef}
                type="text"
                value={summary}
                maxLength={200}
                onChange={(event) => setSummary(event.target.value)}
                disabled={busy}
                autoComplete="off"
              />
            </label>
            <label>
              {copy.descriptionLabel}
              <textarea
                value={description}
                maxLength={5000}
                rows={6}
                onChange={(event) => setDescription(event.target.value)}
                disabled={busy}
                placeholder={copy.descriptionHint}
              />
            </label>
            <label className="help-ticket-contact">
              <input
                type="checkbox"
                checked={contactRequested}
                onChange={(event) => setContactRequested(event.target.checked)}
                disabled={busy}
              />
              Contact me about this
            </label>
            {contactRequested ? (
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
            ) : null}
            <p className="hint">
              Your manuscript is not included. Version and system info are sent so we can
              reproduce the problem.
            </p>
            {error ? <p className="help-ticket-error">{error}</p> : null}
            <div className="help-ticket-actions">
              <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'Sending…' : copy.submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
