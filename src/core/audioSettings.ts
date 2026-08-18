export interface AudioSettings {
  /** Empty string means the system default input. */
  inputDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  inputDeviceId: '',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
