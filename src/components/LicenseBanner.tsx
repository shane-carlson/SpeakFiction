import type { useLicense } from '../hooks/useLicense';

export function LicenseBanner({ license }: { license: ReturnType<typeof useLicense> }) {
  const { status } = license;
  if (!status.gated || status.kind === 'licensed') return null;

  const tone = status.kind === 'expired' ? 'expired' : status.kind === 'grace' ? 'grace' : 'trial';
  const title =
    status.kind === 'expired' ? 'Trial ended' : status.kind === 'grace' ? 'License offline' : 'Trial';

  return (
    <div className={`license-banner license-banner-${tone}`}>
      <strong>{title}</strong>
      <div>{status.message}</div>
      {status.canBuy && status.kind !== 'grace' && (
        <button type="button" className="btn license-banner-buy" onClick={() => void license.buy()}>
          Buy a license
        </button>
      )}
    </div>
  );
}
