import { useLocalAudio } from '../hooks/useLocalAudio';

export function AudioSettingsPanel() {
  const audio = useLocalAudio();
  const granted = audio.micStatus === 'granted';
  const labelsHidden = audio.devices.length > 0 && audio.devices.every((d) => d.label.startsWith('Microphone '));

  return (
    <div className="audio-settings">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h4>Local audio</h4>
        <span className={`badge ${granted ? 'item' : ''}`}>
          {audio.micStatus === 'granted'
            ? 'Microphone allowed'
            : audio.micStatus === 'denied' || audio.micStatus === 'restricted'
              ? 'Microphone blocked'
              : 'Permission needed'}
        </span>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor="audio-input">Input device</label>
        <select
          id="audio-input"
          value={audio.audioSettings.inputDeviceId}
          onChange={(e) => audio.setAudioSettings({ inputDeviceId: e.target.value })}
          disabled={audio.devices.length === 0}
        >
          <option value="">System default</option>
          {audio.devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        {labelsHidden && (
          <div className="hint" style={{ marginTop: 6 }}>
            Device names appear after microphone access is granted.
          </div>
        )}
      </div>

      <div className="audio-toggles">
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={audio.audioSettings.noiseSuppression}
            onChange={(e) => audio.setAudioSettings({ noiseSuppression: e.target.checked })}
          />
          Noise suppression
        </label>
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={audio.audioSettings.echoCancellation}
            onChange={(e) => audio.setAudioSettings({ echoCancellation: e.target.checked })}
          />
          Echo cancellation
        </label>
        <label className="audio-toggle">
          <input
            type="checkbox"
            checked={audio.audioSettings.autoGainControl}
            onChange={(e) => audio.setAudioSettings({ autoGainControl: e.target.checked })}
          />
          Auto gain
        </label>
      </div>

      {audio.error && (
        <div className="hint" style={{ color: 'var(--warn)', marginTop: 8 }}>
          {audio.error}
        </div>
      )}

      <div className="row wrap" style={{ marginTop: 12 }}>
        {!granted && (
          <button className="btn primary" type="button" onClick={() => void audio.requestAccess()}>
            Allow microphone
          </button>
        )}
        {granted && labelsHidden && (
          <button className="btn" type="button" onClick={() => void audio.requestAccess()}>
            Refresh devices
          </button>
        )}
        {audio.hasNativeAudio && (
          <>
            <button className="btn ghost" type="button" onClick={() => void audio.openSoundSettings()}>
              macOS Sound settings
            </button>
            <button className="btn ghost" type="button" onClick={() => void audio.openMicPrivacySettings()}>
              Privacy → Microphone
            </button>
          </>
        )}
      </div>
    </div>
  );
}
