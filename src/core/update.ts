export type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

export interface UpdateStatus {
  enabled: boolean;
  state: UpdateState;
  currentVersion: string;
  availableVersion: string | null;
  percent: number | null;
  error: string | null;
}

export const IDLE_UPDATE_STATUS: UpdateStatus = {
  enabled: false,
  state: 'idle',
  currentVersion: '',
  availableVersion: null,
  percent: null,
  error: null,
};

export function shouldShowUpdateBanner(status: UpdateStatus): boolean {
  if (!status.enabled) return false;
  return status.state === 'downloading' || status.state === 'ready';
}
