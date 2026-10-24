import { useMemo } from 'react';
import type { Book } from '../core/types';
import { getGenre } from '../core/genres';
import { toScrivener } from '../core/export';
import { manuscriptStats } from '../core/manuscript';
import { formatSeriesBookNumber } from '../core/seriesBooks';
import { NativeHandoff } from '../components/NativeHandoff';
import { ExportPane } from '../components/hm/ExportPane';
import { documentFromManuscript } from '../hm/bridge';
import { useStore } from '../store';

export function IntegrationsView({ book }: { book: Book }) {
  const series = useStore((s) => s.series);
  const genre = getGenre(book.genreId);
  const stats = useMemo(() => manuscriptStats(book.manuscript), [book.manuscript]);
  const scrivener = useMemo(
    () => toScrivener(book.manuscript, { title: book.title, genre }),
    [book.manuscript, book.title, genre],
  );
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
    <>
      <div className="page-head">
        <div>
          <h2>Integrations</h2>
          <p>
            Guided, one-click hand-off to your writing tool. Spoken cues become real chapters, scenes,
            and sections on import.
          </p>
        </div>
        <div className="book-pill">
          <span>📖</span>
          <b>{book.title}</b>
          <span>
            · {stats.chapters} ch · {stats.scenes} scenes · {stats.words} words · {doc.points.length}{' '}
            seal{doc.points.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <ExportPane doc={doc} bookTitle={book.title} seriesLabel={seriesLabel} embedded />

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <NativeHandoff book={book} />
        </div>

        <div className="card">
          <h3>Structure preview</h3>
          <p className="sub">
            What SpeakFiction will create as chapters and scenes in the destination.
          </p>
          {scrivener.outline.length === 0 ? (
            <div className="empty">Dictate some chapters and scenes first.</div>
          ) : (
            <div>
              {scrivener.outline.map((o, i) => (
                <div
                  key={i}
                  className="list-row"
                  style={{ marginBottom: 6, paddingLeft: o.level === 2 ? 28 : 12 }}
                >
                  <span className={`badge ${o.kind}`}>{o.kind}</span>
                  <div className="grow">
                    <span className={o.level === 1 ? 'name' : ''}>{o.title}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
