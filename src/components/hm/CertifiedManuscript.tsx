import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import type { Book } from '../../core/types';
import type { ManuscriptPlace } from '../../core/persistedState';
import { formatSeriesBookNumber } from '../../core/seriesBooks';
import { readOsPrefersDark, resolveThemeMode } from '../../core/theme';
import { documentFromManuscript } from '../../hm/bridge';
import '../../hm/editor.css';
import { Editor } from './Editor';

/** Humanuscript manuscript surface, fed by the SpeakFiction book and dictation place. */
export function CertifiedManuscript({
  book,
  onPlaceChange,
}: {
  book: Book;
  onPlaceChange?: (place: ManuscriptPlace) => void;
}) {
  const replaceManuscriptDocument = useStore((s) => s.replaceManuscriptDocument);
  const series = useStore((s) => s.series);
  const themeMode = useStore((s) => s.themeMode);
  const [osDark] = useState(readOsPrefersDark);
  const mode = resolveThemeMode(themeMode, osDark);
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
    <div className="hm-root" data-mode={mode}>
      <Editor
        doc={doc}
        bookTitle={book.title}
        seriesLabel={seriesLabel}
        onChange={(next) => replaceManuscriptDocument(book.id, next)}
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
