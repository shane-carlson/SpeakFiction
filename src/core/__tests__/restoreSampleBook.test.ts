import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '../../store';
import {
  EMBER_KING_CHAPTERS,
  EMBER_KING_SERIES,
  EMBER_KING_TITLE,
  isEmberKingExampleTitle,
  libraryHasEmberKingSample,
} from '../seedManuscript';

function sampleInLibrary() {
  return useStore.getState().books.find((b) => isEmberKingExampleTitle(b.title));
}

describe('restoreSampleBook', () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length) {
      const id = created.pop();
      if (id) useStore.getState().deleteBook(id);
    }
    if (!libraryHasEmberKingSample(useStore.getState().books)) {
      useStore.getState().restoreSampleBook();
    }
  });

  it('adds the example back after it was deleted', () => {
    const original = sampleInLibrary();
    expect(original).toBeTruthy();
    const seriesId = original!.seriesId;
    useStore.getState().deleteBook(original!.id);

    expect(libraryHasEmberKingSample(useStore.getState().books)).toBe(false);
    const id = useStore.getState().restoreSampleBook();
    created.push(id);

    const restored = useStore.getState().books.find((b) => b.id === id);
    expect(restored?.title).toBe(EMBER_KING_TITLE);
    expect(restored?.seriesId).toBe(seriesId);
    expect(restored?.nameLibrary.map((n) => n.canonical)).toEqual([
      'Kaeldros',
      'Aelith',
      'Vaelthorn Keep',
      'Sunspar',
      'The Ashen Order',
    ]);
    expect(restored?.manuscript.blocks.filter((b) => b.type === 'chapter').map((c) => c.title)).toEqual([
      ...EMBER_KING_CHAPTERS,
    ]);
    expect(useStore.getState().activeBookId).toBe(id);
    expect(useStore.getState().series.filter((s) => s.name === EMBER_KING_SERIES)).toHaveLength(1);
  });

  it('does not duplicate the example when it is already in the library', () => {
    const existing = sampleInLibrary();
    expect(existing).toBeTruthy();
    const count = useStore.getState().books.length;
    const id = useStore.getState().restoreSampleBook();
    expect(id).toBe(existing!.id);
    expect(useStore.getState().books.length).toBe(count);
    expect(useStore.getState().activeBookId).toBe(existing!.id);
  });

  it('creates the example series again if that series is gone', () => {
    const original = sampleInLibrary();
    expect(original).toBeTruthy();
    useStore.getState().deleteBook(original!.id);
    useStore.setState({
      series: useStore.getState().series.filter((s) => s.name !== EMBER_KING_SERIES),
    });

    const id = useStore.getState().restoreSampleBook();
    created.push(id);
    const restored = useStore.getState().books.find((b) => b.id === id);
    const series = useStore.getState().series.find((s) => s.id === restored?.seriesId);
    expect(series?.name).toBe(EMBER_KING_SERIES);
    expect(restored?.seriesBookNumber).toBe(1);
  });
});
