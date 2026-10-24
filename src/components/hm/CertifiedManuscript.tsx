import { useMemo } from 'react';
import { useStore } from '../../store';
import type { Book } from '../../core/types';
import type { ManuscriptPlace } from '../../core/persistedState';
import { formatSeriesBookNumber } from '../../core/seriesBooks';
import { documentFromManuscript } from '../../hm/bridge';
import '../../hm/editor.css';
import { Editor } from './Editor';

/** Humanuscript manuscript surface, fed by the SpeakFiction book and dictation place. */
export function CertifiedManuscript({
  book,
  onPlaceChange,
  canInsertDictation = false,
  onInsertDictation,
  insertAt = null,
}: {
  book: Book;
  onPlaceChange?: (place: ManuscriptPlace) => void;
  canInsertDictation?: boolean;
  onInsertDictation?: (target: { atIndex?: number; blockId?: string; splitOffset?: number }) => void;
  insertAt?: number | null;
}) {
  const replaceManuscriptDocument = useStore((s) => s.replaceManuscriptDocument);
  const series = useStore((s) => s.series);
  const editorOpen = useStore((s) => s.manuscriptEditorOpen);
  const setEditorOpen = useStore((s) => s.setManuscriptEditorOpen);
  const doc = useMemo(
    () => documentFromManuscript(book.manuscript, book.id, book.title),
    [book.manuscript, book.id, book.title],
  );
  const seriesName = book.seriesId ? series.find((item) => item.id === book.seriesId)?.name : undefined;
  const seriesLabel =
    book.seriesId && seriesName
      ? book.seriesBookNumber != null
        ? `Book ${formatSeriesBookNumber(book.seriesBookNumber)} of ${seriesName}`
        : seriesName
      : null;

  return (
    <div className="hm-root">
      <Editor
        doc={doc}
        bookTitle={book.title}
        seriesLabel={seriesLabel}
        focusMode={editorOpen}
        onFocusModeChange={setEditorOpen}
        onChange={(next) => replaceManuscriptDocument(book.id, next)}
        canInsertDictation={canInsertDictation}
        onInsertDictation={onInsertDictation}
        insertAt={insertAt}
        onDictationTarget={(target) => {
          if (target.blockId) {
            onPlaceChange?.({
              scrollTop: 0,
              blockId: target.blockId,
              selectionStart: target.splitOffset,
              selectionEnd: target.splitOffset,
            });
            return;
          }
          onPlaceChange?.({ scrollTop: 0, atIndex: target.atIndex });
        }}
      />
    </div>
  );
}
