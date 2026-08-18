import { useCallback, useEffect, useState } from 'react';
import { useStore, type AudioSettings } from '../store';
import type { MicAccessStatus } from '../speakfiction';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

function nativeAudio() {
  return window.speakfiction?.audio;
}

export async function openMicrophone(settings: AudioSettings): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This device does not expose local audio inputs.');
  }
  const processing: MediaTrackConstraints = {
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
  };
  if (settings.inputDeviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { ...processing, deviceId: { exact: settings.inputDeviceId } },
      });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...processing, deviceId: { ideal: settings.inputDeviceId } },
        });
      } catch {
        /* fall through to default device */
      }
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: processing });
}

export function useLocalAudio() {
  const audioSettings = useStore((s) => s.audioSettings);
  const setAudioSettings = useStore((s) => s.setAudioSettings);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [micStatus, setMicStatus] = useState<MicAccessStatus>('unknown');
  const [error, setError] = useState<string | null>(null);
  const hasNativeAudio = Boolean(nativeAudio());

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(
      all
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        })),
    );
  }, []);

  const requestAccess = useCallback(async () => {
    setError(null);
    const native = nativeAudio();
    if (native) {
      const ok = await native.requestMic();
      setMicStatus(ok ? 'granted' : await native.getMicStatus());
      if (!ok) {
        setError('Microphone access was denied. Enable it in System Settings.');
        return false;
      }
    }
    try {
      const stream = await openMicrophone(audioSettings);
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('granted');
      await refreshDevices();
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not open the microphone.';
      setError(message);
      setMicStatus('denied');
      return false;
    }
  }, [audioSettings, refreshDevices]);

  useEffect(() => {
    void (async () => {
      if (nativeAudio()) setMicStatus(await nativeAudio()!.getMicStatus());
      await refreshDevices();
    })();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => void refreshDevices();
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  useEffect(() => {
    if (
      audioSettings.inputDeviceId &&
      devices.length > 0 &&
      !devices.some((d) => d.deviceId === audioSettings.inputDeviceId)
    ) {
      setAudioSettings({ inputDeviceId: '' });
    }
  }, [audioSettings.inputDeviceId, devices, setAudioSettings]);

  return {
    devices,
    micStatus,
    error,
    hasNativeAudio,
    audioSettings,
    setAudioSettings,
    requestAccess,
    openSoundSettings: () => nativeAudio()?.openSoundSettings(),
    openMicPrivacySettings: () => nativeAudio()?.openMicPrivacySettings(),
  };
}
