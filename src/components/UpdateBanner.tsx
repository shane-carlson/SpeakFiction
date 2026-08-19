import { shouldShowUpdateBanner } from '../core/update';
import type { useUpdater } from '../hooks/useUpdater';

export function UpdateBanner({
  updater,
  dictating,
}: {
  updater: ReturnType<typeof useUpdater>;
  dictating: boolean;
}) {
  const { status, busy, error, install } = updater;
  if (!shouldShowUpdateBanner(status) && !(status.enabled && status.state === 'error' && error)) {
    return null;
  }

  const version = status.availableVersion ? `v${status.availableVersion}` : 'an update';
  const downloading = status.state === 'downloading';
  const ready = status.state === 'ready';
  const percent = status.percent != null ? Math.max(0, Math.min(100, Math.round(status.percent))) : null;

  return (
    <div className={`update-banner${ready ? ' update-banner-ready' : ''}`}>
      <strong>{ready ? 'Update ready' : downloading ? 'Downloading update' : 'Update'}</strong>
      <div>
        {ready
          ? `${version} is ready. Restart SpeakFiction to install. Your license stays on this device.`
          : downloading
            ? `Downloading ${version}${percent != null ? ` (${percent}%)` : '…'}`
            : error || status.error}
      </div>
      {ready && (
        <button
          type="button"
          className="btn update-banner-restart"
          disabled={busy || dictating}
          title={dictating ? 'Pause dictation before installing the update' : 'Restart and install the update'}
          onClick={() => void install()}
        >
          {dictating ? 'Pause dictation to restart' : 'Restart to install'}
        </button>
      )}
    </div>
  );
}
