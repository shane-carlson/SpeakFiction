import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  CHECK_LABEL,
  REPORT_PROBLEM_LABEL,
  REQUEST_FEATURE_LABEL,
  buildAppMenuTemplate,
} = require('../../../electron/appMenu.cjs') as {
  CHECK_LABEL: string;
  REPORT_PROBLEM_LABEL: string;
  REQUEST_FEATURE_LABEL: string;
  buildAppMenuTemplate: (opts: {
    platform: string;
    appName: string;
    onCheckForUpdates: () => void;
    onReportProblem?: () => void;
    onRequestFeature?: () => void;
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

  it('puts support and feature tickets under Help on macOS', () => {
    const onReport = vi.fn();
    const onFeature = vi.fn();
    const template = buildAppMenuTemplate({
      platform: 'darwin',
      appName: 'SpeakFiction',
      onCheckForUpdates: () => undefined,
      onReportProblem: onReport,
      onRequestFeature: onFeature,
    });
    const help = template.find((item) => item.role === 'help');
    const helpLabels = labels(help?.submenu as unknown[]);
    expect(helpLabels).toContain(REPORT_PROBLEM_LABEL);
    expect(helpLabels).toContain(REQUEST_FEATURE_LABEL);
    expect(helpLabels).not.toContain(CHECK_LABEL);

    const items = help?.submenu as Array<{ label?: string; click?: () => void }>;
    items.find((item) => item.label === REPORT_PROBLEM_LABEL)?.click?.();
    items.find((item) => item.label === REQUEST_FEATURE_LABEL)?.click?.();
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onFeature).toHaveBeenCalledTimes(1);
  });

  it('puts support and feature tickets under Help on Windows after Check for Updates', () => {
    const template = buildAppMenuTemplate({
      platform: 'win32',
      appName: 'SpeakFiction',
      onCheckForUpdates: () => undefined,
    });
    const help = template.find((item) => item.role === 'help');
    const helpLabels = labels(help?.submenu as unknown[]);
    expect(helpLabels.indexOf(CHECK_LABEL)).toBeLessThan(helpLabels.indexOf(REPORT_PROBLEM_LABEL));
    expect(helpLabels).toContain(REQUEST_FEATURE_LABEL);
  });
});
