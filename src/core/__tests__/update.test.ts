import { describe, expect, it } from 'vitest';
import { IDLE_UPDATE_STATUS, shouldShowUpdateBanner, type UpdateStatus } from '../update';

function status(patch: Partial<UpdateStatus>): UpdateStatus {
  return { ...IDLE_UPDATE_STATUS, enabled: true, ...patch };
}

describe('shouldShowUpdateBanner', () => {
  it('hides unpackaged and idle states', () => {
    expect(shouldShowUpdateBanner(IDLE_UPDATE_STATUS)).toBe(false);
    expect(shouldShowUpdateBanner(status({ state: 'idle' }))).toBe(false);
    expect(shouldShowUpdateBanner(status({ state: 'checking' }))).toBe(false);
    expect(shouldShowUpdateBanner(status({ state: 'error', error: 'offline' }))).toBe(false);
  });

  it('shows while downloading or ready to restart', () => {
    expect(shouldShowUpdateBanner(status({ state: 'downloading', percent: 40 }))).toBe(true);
    expect(shouldShowUpdateBanner(status({ state: 'ready', availableVersion: '0.1.4' }))).toBe(true);
  });
});
