import { useState, type FormEvent } from 'react';
import type { LicenseStatus } from '../core/license';

export function LicenseActions({
  status,
  busy,
  error,
  onBuy,
  onActivate,
  compact = false,
}: {
  status: LicenseStatus;
  busy: boolean;
  error: string | null;
  onBuy: () => void;
  onActivate: (key: string) => Promise<unknown>;
  compact?: boolean;
}) {
  const [key, setKey] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    const result = await onActivate(trimmed);
    const ok = Boolean(result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok);
    if (ok) setKey('');
  };

  return (
    <div className="license-actions">
      {!compact &&
        (status.canBuy ? (
          <button type="button" className="btn primary" onClick={() => void onBuy()} disabled={busy}>
            Buy a license
          </button>
        ) : (
          <p className="hint">Checkout is not configured in this build yet.</p>
        ))}
      <form className="license-key-form" onSubmit={(e) => void submit(e)}>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste SF- license key"
          autoComplete="off"
          spellCheck={false}
          aria-label="License key"
          disabled={busy}
        />
        <button type="submit" className="btn" disabled={busy || !key.trim()}>
          {busy ? 'Activating…' : 'Activate'}
        </button>
      </form>
      {error && <div className="license-error">{error}</div>}
      {!compact && (
        <p className="hint license-privacy">
          Polar handles payment. Your manuscript and dictation stay on this device.
        </p>
      )}
    </div>
  );
}
