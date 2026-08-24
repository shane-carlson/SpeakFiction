import { afterEach, describe, expect, it } from 'vitest';
import { joinDraft, joinDraftAt, draftText, plainDraft, takeInsertTranscript } from '../dictationDraft';
import { cleanupDictationText } from '../dictationProcessor';
import { getGenre } from '../genres';
import { destFromPlace, type ManuscriptInsertAt } from '../manuscript';
import { mergeSeriesNameLibrary, seriesNameViews } from '../seriesNames';
import { useStore } from '../../store';

function promote(bookId: string, dest?: ManuscriptInsertAt) {
  const draft = useStore.getState().dictationDrafts[bookId] ?? [];
  const { transcript, remaining } = takeInsertTranscript(draft);
  if (!transcript) return;
  useStore.getState().applyDictation(bookId, transcript, dest);
  useStore.getState().setDictationDraft(bookId, remaining);
}

describe('applyDictation', () => {
  const created: string[] = [];

  afterEach(() => {
    while (created.length) {
      const id = created.pop();
      if (id) useStore.getState().deleteBook(id);
    }
  });

  it('keeps live speech in the transcription box until promote', () => {
    const bookId = useStore.getState().createBook('Staging buffer test', 'fantasy');
    created.push(bookId);

    const spoken = joinDraft([], 'the wind howled period');
    useStore.getState().setDictationDraft(bookId, spoken);

    expect(useStore.getState().dictationDrafts[bookId]).toEqual(spoken);
    const blocks = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(blocks).toEqual([]);
  });

  it('does not write the manuscript when landing dictation in the transcription box', () => {
    const bookId = useStore.getState().createBook('Transcript-first test', 'fantasy');
    created.push(bookId);

    const landed = joinDraftAt(plainDraft('Hello. World.'), 'the wind howled', 7);
    useStore.getState().setDictationDraft(bookId, landed);

    expect(draftText(landed)).toBe('Hello. the wind howled World.');
    expect(useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? []).toEqual([]);
  });

  it('inserts at the chosen manuscript index and clears the transcription box', () => {
    const bookId = useStore.getState().createBook('Insert draft test', 'fantasy');
    created.push(bookId);

    useStore.getState().applyDictation(bookId, 'Before period');
    const seeded = useStore.getState().books.find((b) => b.id === bookId);
    expect(seeded?.manuscript.blocks).toHaveLength(1);
    expect(seeded?.manuscript.blocks[0].text).toMatch(/Before/i);

    const draft = [
      { text: 'the wind howled period ', struck: false },
      { text: 'scratch this.', struck: true },
    ];
    useStore.getState().setDictationDraft(bookId, draft);

    const { transcript, remaining } = takeInsertTranscript(
      useStore.getState().dictationDrafts[bookId],
    );
    expect(transcript).toMatch(/the wind howled period/i);
    expect(remaining).toEqual([]);

    useStore.getState().applyDictation(bookId, transcript, { atIndex: 0 });
    useStore.getState().setDictationDraft(bookId, remaining);

    expect(useStore.getState().dictationDrafts[bookId]).toEqual([]);
    const blocks = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(blocks[0]?.text).toMatch(/wind howled/i);
    expect(blocks[1]?.text).toMatch(/Before/i);
    expect(blocks.map((b) => b.text).join(' ')).not.toMatch(/scratch this/i);
  });

  it('omits struck spans from the manuscript and clears the box after append', () => {
    const bookId = useStore.getState().createBook('Append draft test', 'fantasy');
    created.push(bookId);

    const draft = [
      { text: 'Hello. ', struck: false },
      { text: 'World.', struck: true },
    ];
    useStore.getState().setDictationDraft(bookId, draft);
    promote(bookId);

    expect(useStore.getState().dictationDrafts[bookId]).toEqual([]);
    const prose = useStore
      .getState()
      .books.find((b) => b.id === bookId)
      ?.manuscript.blocks.filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');
    expect(prose).toMatch(/Hello/i);
    expect(prose).not.toMatch(/World/i);
  });

  it('does not clear the transcription box when only setting a manuscript caret', () => {
    const bookId = useStore.getState().createBook('Caret only test', 'fantasy');
    created.push(bookId);
    const draft = [{ text: 'staged prose period', struck: false }];
    useStore.getState().setDictationDraft(bookId, draft);
    useStore.getState().setManuscriptPlace(bookId, { scrollTop: 0, blockId: 'blk-1', selectionStart: 4 });
    expect(useStore.getState().dictationDrafts[bookId]).toEqual(draft);
  });

  it('inserts between a scene and its first paragraph when that gap is the place', () => {
    const bookId = useStore.getState().createBook('Gap insert test', 'fantasy');
    created.push(bookId);
    useStore.getState().applyDictation(
      bookId,
      'new chapter titled The Gate period new scene titled The Ridge period the wind howled period',
    );
    const seeded = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    const sceneIdx = seeded.findIndex((b) => b.type === 'scene');
    expect(sceneIdx).toBeGreaterThanOrEqual(0);
    expect(seeded[sceneIdx + 1]?.type).toBe('paragraph');

    const dest = destFromPlace(seeded, { atIndex: sceneIdx + 1 });
    useStore.getState().applyDictation(bookId, 'aleith waited period', dest);
    const blocks = useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [];
    expect(blocks[sceneIdx]?.type).toBe('scene');
    expect(blocks[sceneIdx + 1]?.text).toMatch(/aleith waited/i);
    expect(blocks[sceneIdx + 2]?.text).toMatch(/wind howled/i);
  });

  it('appends at the end when no insertion point is selected', () => {
    const bookId = useStore.getState().createBook('Default end insert', 'fantasy');
    created.push(bookId);
    useStore.getState().applyDictation(bookId, 'the wind howled period');
    const dest = destFromPlace(
      useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [],
    );
    useStore.getState().applyDictation(bookId, 'aleith waited period', dest);
    const prose = (useStore.getState().books.find((b) => b.id === bookId)?.manuscript.blocks ?? [])
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');
    expect(prose).toMatch(/wind howled/i);
    expect(prose).toMatch(/aleith waited/i);
  });

  it('adds a spoken New Character name to the library and not the manuscript', () => {
    const bookId = useStore.getState().createBook('New character insert', 'fantasy');
    created.push(bookId);

    useStore.getState().applyDictation(bookId, 'New Character. Andreos. Andreos.');
    const book = useStore.getState().books.find((b) => b.id === bookId);
    expect(book?.nameLibrary.map((n) => n.canonical)).toContain('Andreos');
    expect(book?.nameLibrary.find((n) => n.canonical === 'Andreos')?.originBookId).toBe(bookId);
    const prose = (book?.manuscript.blocks ?? [])
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');
    expect(prose).not.toMatch(/new character/i);
    expect(prose).not.toMatch(/Andreos/i);
    expect(book?.manuscript.blocks ?? []).toEqual([]);
  });

  it('keeps leftover prose after New Character and shares the name across a series', () => {
    const seriesId = useStore.getState().createSeries('The Cycle');
    const originId = useStore.getState().createBook('Ash Rising', 'fantasy', seriesId);
    const laterId = useStore.getState().createBook('Winter of Glass', 'fantasy', seriesId);
    created.push(originId, laterId);

    useStore.getState().applyDictation(originId, 'New Character. Mara Vale. Mara Vale. the wind howled period');
    const origin = useStore.getState().books.find((b) => b.id === originId);
    expect(origin?.nameLibrary.some((n) => n.canonical === 'Mara Vale' && n.originBookId === originId)).toBe(
      true,
    );
    const originProse = (origin?.manuscript.blocks ?? [])
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');
    expect(originProse).toMatch(/wind howled/i);
    expect(originProse).not.toMatch(/new character/i);
    expect(originProse).not.toMatch(/Mara Vale/i);

    useStore.getState().applyDictation(laterId, 'mara vale ran period');
    const later = useStore.getState().books.find((b) => b.id === laterId);
    const laterProse = (later?.manuscript.blocks ?? [])
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.text)
      .join(' ');
    expect(laterProse).toContain('Mara Vale');
    expect(later?.nameLibrary.some((n) => n.canonical === 'Mara Vale')).toBe(false);

    const views = seriesNameViews(useStore.getState().books, later!);
    const mara = views.find((v) => v.entry.canonical === 'Mara Vale');
    expect(mara).toMatchObject({
      originBookId: originId,
      originBookTitle: 'Ash Rising',
      fromThisBook: false,
    });
  });

  it('adds the name from a spoken cue even when nothing remains to insert', () => {
    const bookId = useStore.getState().createBook('Cue only', 'fantasy');
    created.push(bookId);
    const book = useStore.getState().books.find((b) => b.id === bookId)!;
    const { text, newCharacters } = cleanupDictationText('New Character. Kael. Kael.', {
      entries: mergeSeriesNameLibrary(useStore.getState().books, book),
      genre: getGenre('fantasy'),
    });
    expect(text).toBe('');
    expect(newCharacters[0]?.canonical).toBe('Kael');
    for (const ch of newCharacters) {
      useStore.getState().addNameEntry(bookId, {
        canonical: ch.canonical,
        category: 'character',
        aliases: ch.aliases,
        originBookId: bookId,
      });
    }
    const next = useStore.getState().books.find((b) => b.id === bookId);
    expect(next?.nameLibrary.map((n) => n.canonical)).toContain('Kael');
    expect(next?.manuscript.blocks ?? []).toEqual([]);
  });

  it('attaches a dictation voice clip onto an existing spoken name', () => {
    const bookId = useStore.getState().createBook('Clip attach', 'fantasy');
    created.push(bookId);
    useStore.getState().addNameEntry(bookId, {
      canonical: 'Kael',
      category: 'character',
      aliases: [],
      originBookId: bookId,
    });
    useStore.getState().addNameEntry(bookId, {
      canonical: 'Kael',
      category: 'character',
      aliases: [],
      originBookId: bookId,
      voiceClips: [{ mediaId: 'nvc_dict', heard: 'Kael Kael', source: 'dictation' }],
    });
    const next = useStore.getState().books.find((b) => b.id === bookId);
    const kael = next?.nameLibrary.find((n) => n.canonical === 'Kael');
    expect(kael?.voiceClips).toEqual([{ mediaId: 'nvc_dict', heard: 'Kael Kael', source: 'dictation' }]);
  });

  it('edits and removes a series name on the origin book', () => {
    const seriesId = useStore.getState().createSeries('Owning book');
    const originId = useStore.getState().createBook('Ash Rising', 'fantasy', seriesId);
    const laterId = useStore.getState().createBook('Winter of Glass', 'fantasy', seriesId);
    created.push(originId, laterId);

    useStore.getState().applyDictation(originId, 'New Character. Kael. Kael.');
    const entry = useStore
      .getState()
      .books.find((b) => b.id === originId)
      ?.nameLibrary.find((n) => n.canonical === 'Kael');
    expect(entry).toBeTruthy();

    useStore.getState().updateNameEntry(laterId, { ...entry!, note: 'edited from book 2' });
    expect(
      useStore.getState().books.find((b) => b.id === originId)?.nameLibrary.find((n) => n.id === entry!.id)?.note,
    ).toBe('edited from book 2');
    expect(useStore.getState().books.find((b) => b.id === laterId)?.nameLibrary).toEqual([]);

    useStore.getState().removeNameEntry(laterId, entry!.id);
    expect(useStore.getState().books.find((b) => b.id === originId)?.nameLibrary).toEqual([]);
  });
});
