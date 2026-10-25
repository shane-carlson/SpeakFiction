import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const sessionStore = require('../../../electron/sessionStore.cjs') as {
  applyDictateTab: (json: string | null) => string | null;
};

describe('sessionStore applyDictateTab', () => {
  it('moves a crashed Library session onto Dictate', () => {
    const next = sessionStore.applyDictateTab(
      JSON.stringify({ state: { activeTab: 'library', books: [{ id: 'bk-1' }] }, version: 4 }),
    );
    expect(next).toBeTruthy();
    expect(JSON.parse(next!).state.activeTab).toBe('dictate');
    expect(JSON.parse(next!).state.books).toEqual([{ id: 'bk-1' }]);
  });

  it('leaves an already-Dictate session alone', () => {
    expect(
      sessionStore.applyDictateTab(JSON.stringify({ state: { activeTab: 'dictate' }, version: 4 })),
    ).toBeNull();
  });

  it('does not reset Voice notes or drop the manuscript after a crash', () => {
    const raw = JSON.stringify({
      state: {
        activeTab: 'notes',
        books: [{ id: 'bk-1', title: 'The Gate', manuscript: { blocks: [{ id: 'p1', text: 'the wind howled' }] } }],
      },
      version: 4,
    });
    expect(sessionStore.applyDictateTab(raw)).toBeNull();
  });
});
