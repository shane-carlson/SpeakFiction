import { useMemo } from 'react';
import type { Book } from '../core/types';
import { manuscriptStats } from '../core/manuscript';
import { ManuscriptVersionsPanel } from '../components/ManuscriptVersionsPanel';

export function VersionsView({ book }: { book: Book }) {
  const stats = useMemo(() => manuscriptStats(book.manuscript), [book.manuscript]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2 id="ms-versions-title">Versions</h2>
          <p>
            Recovery points saved as you dictate and edit. Review one, then restore it if you want
            that draft back.
          </p>
        </div>
        <div className="book-pill">
          <span>📖</span>
          <b>{book.title}</b>
          <span>
            · {stats.chapters} ch · {stats.scenes} scenes · {stats.words} words
          </span>
        </div>
      </div>

      <ManuscriptVersionsPanel
        layout="page"
        bookId={book.id}
        currentBlocks={book.manuscript.blocks}
      />
    </>
  );
}
