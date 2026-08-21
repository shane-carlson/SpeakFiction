import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { CHECK_LABEL, buildAppMenuTemplate } = require('../../../electron/appMenu.cjs') as {
  CHECK_LABEL: string;
  buildAppMenuTemplate: (opts: {
    platform: string;
    appName: string;
    onCheckForUpdates: () => void;
  }) => Array<{ label?: string; role?: string; submenu?: unknown[] }>;
};

function labels(submenu: unknown[] | undefined): string[] {
  return (submenu ?? []).map((item) => {
    const rec = item as { label?: string; role?: string; type?: string };
    return rec.label || rec.role || rec.type || '';
  });
}

describe('app menu', () => {
  it('puts Check for Updates in the SpeakFiction menu on macOS', () => {
    const onCheck = vi.fn();
    const template = buildAppMenuTemplate({
      platform: 'darwin',
      appName: 'SpeakFiction',
      onCheckForUpdates: onCheck,
    });
    expect(template[0]?.label).toBe('SpeakFiction');
    const appLabels = labels(template[0]?.submenu as unknown[]);
    expect(appLabels[0]).toBe('about');
    expect(appLabels).toContain(CHECK_LABEL);
    expect(appLabels.indexOf(CHECK_LABEL)).toBeGreaterThan(appLabels.indexOf('about'));

    const check = (template[0]?.submenu as Array<{ label?: string; click?: () => void }>).find(
      (item) => item.label === CHECK_LABEL,
    );
    check?.click?.();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('puts Check for Updates under Help on Windows', () => {
    const template = buildAppMenuTemplate({
      platform: 'win32',
      appName: 'SpeakFiction',
      onCheckForUpdates: () => undefined,
    });
    expect(template[0]?.role).toBe('fileMenu');
    const help = template.find((item) => item.role === 'help');
    expect(labels(help?.submenu as unknown[])).toContain(CHECK_LABEL);
  });
});
