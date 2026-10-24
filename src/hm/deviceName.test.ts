import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  UNAVAILABLE_DEVICE_LABEL,
  clearTypingDeviceLabelCache,
  formatTypingDeviceLabel,
  getTypingDeviceLabel,
  shortPlatformLabel,
} from './deviceName';

test('short platform label names the OS and browser without inventing a hostname', () => {
  assert.equal(
    shortPlatformLabel({
      platform: 'macOS',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      brands: [{ brand: 'Google Chrome' }, { brand: 'Chromium' }, { brand: 'Not_A Brand' }],
    }),
    'Mac · Chrome',
  );
  assert.equal(
    shortPlatformLabel({
      platform: 'Linux',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      brands: [{ brand: 'Chromium' }],
    }),
    'Linux · Chrome',
  );
  assert.equal(
    shortPlatformLabel({
      platform: 'Windows',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      brands: [{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }],
    }),
    'Windows · Edge',
  );
  assert.equal(shortPlatformLabel({ userAgent: '', platform: '', brands: [] }), null);
});

test('a saved unavailable sentence displays the live label, and a hostname stays a hostname', () => {
  assert.equal(formatTypingDeviceLabel('studio.local', 'Mac · Chrome'), 'studio.local');
  assert.equal(formatTypingDeviceLabel(UNAVAILABLE_DEVICE_LABEL, 'Mac · Chrome'), 'Mac · Chrome');
  assert.equal(formatTypingDeviceLabel(undefined, 'Linux · Chrome'), 'Linux · Chrome');
  assert.equal(formatTypingDeviceLabel('  ', null), null);
  assert.equal(formatTypingDeviceLabel(UNAVAILABLE_DEVICE_LABEL, null), null);
  assert.equal(formatTypingDeviceLabel(UNAVAILABLE_DEVICE_LABEL, UNAVAILABLE_DEVICE_LABEL), null);
});

test('electron hostname is kept and an empty desktop name does not become the apology', async () => {
  const previous = (globalThis as { window?: unknown }).window;
  try {
    clearTypingDeviceLabelCache();
    (globalThis as { window?: unknown }).window = {
      humanuscript: { getDeviceName: async () => '  writers-mac.local  ' },
    };
    assert.equal(await getTypingDeviceLabel(), 'writers-mac.local');

    clearTypingDeviceLabelCache();
    (globalThis as { window?: unknown }).window = {
      humanuscript: { getDeviceName: async () => '   ' },
    };
    const fallback = await getTypingDeviceLabel();
    assert.notEqual(fallback, UNAVAILABLE_DEVICE_LABEL);
    if (fallback) assert.match(fallback, / · |^(Mac|Windows|Linux|ChromeOS|Android|iPhone|iPad|iOS|Chrome|Safari|Firefox|Edge|Opera|Brave|Chromium)$/);
  } finally {
    (globalThis as { window?: unknown }).window = previous;
    clearTypingDeviceLabelCache();
  }
});
