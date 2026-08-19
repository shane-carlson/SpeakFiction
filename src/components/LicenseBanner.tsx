import { useState } from 'react';
import type { useLicense } from '../hooks/useLicense';
import { LicenseActions } from './LicenseActions';

export function LicenseBanner({ license }: { license: ReturnType<typeof useLicense> }) {
  const { status } = license;
  const [pasteOpen, setPasteOpen] = useState(false);
  if (!status.gated || status.kind === 'licensed') return null;

  const tone = status.kind === 'expired' ? 'expired' : status.kind === 'grace' ? 'grace' : 'trial';
  const title =
    status.kind === 'expired' ? 'Trial ended' : status.kind === 'grace' ? 'License offline' : 'Trial';
  const showPaste = status.kind === 'trial' && pasteOpen;
  const showBuy = status.canBuy && (status.kind === 'trial' || status.kind === 'expired');
  const showKey = status.kind === 'trial';

  return (
    <div className={`license-banner license-banner-${tone}`}>
      <strong>{title}</strong>
      <div>{status.message}</div>
      {showBuy || showKey ? (
        <div className="license-banner-actions">
          {showBuy && (
            <button type="button" className="btn license-banner-buy" onClick={() => void license.buy()}>
              Buy a license
            </button>
          )}
          {showKey && (
            <button
              type="button"
              className="btn license-banner-buy"
              aria-expanded={pasteOpen}
              aria-controls="license-banner-paste"
              onClick={() => setPasteOpen((open) => !open)}
            >
              {pasteOpen ? 'Hide license key' : 'I have a key'}
            </button>
          )}
        </div>
      ) : null}
      {showPaste && (
        <div id="license-banner-paste">
          <LicenseActions
            compact
            status={status}
            busy={license.busy}
            error={license.error}
            onBuy={() => void license.buy()}
            onActivate={license.activate}
          />
        </div>
      )}
    </div>
  );
}
