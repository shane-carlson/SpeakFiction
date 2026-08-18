import type { useLicense } from '../hooks/useLicense';
import { LicenseActions } from './LicenseActions';

export function LicenseGate({ license }: { license: ReturnType<typeof useLicense> }) {
  const { status } = license;
  if (status.mayDictate) return null;

  return (
    <div className="license-gate" role="dialog" aria-labelledby="license-gate-title">
      <h3 id="license-gate-title">License required to dictate</h3>
      <p>{status.message}</p>
      <p className="sub">
        Your library, manuscript, and exports stay available. Activate a Polar license to start the
        microphone again.
      </p>
      <LicenseActions
        status={status}
        busy={license.busy}
        error={license.error}
        onBuy={() => void license.buy()}
        onActivate={license.activate}
      />
    </div>
  );
}
