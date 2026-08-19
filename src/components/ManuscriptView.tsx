import { useStore } from '../store';
import type { Book } from '../core/types';
import type { ManuscriptPlace } from '../core/persistedState';

function AutoTextarea({
  value,
  onChange,
  onPlace,
}: {
  value: string;
  onChange: (v: string) => void;
  onPlace: (selStart: number, selEnd: number) => void;
}) {
  return (
    <textarea
      value={value}
      rows={Math.max(1, Math.ceil(value.length / 90))}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
        onPlace(e.target.selectionStart, e.target.selectionEnd);
      }}
      onSelect={(e) => {
        const t = e.currentTarget;
        onPlace(t.selectionStart, t.selectionEnd);
      }}
      onFocus={(e) => {
        const t = e.currentTarget;
        onPlace(t.selectionStart, t.selectionEnd);
      }}
    />
  );
}

export function ManuscriptView({
  book,
  place,
  onPlaceChange,
}: {
  book: Book;
  place?: ManuscriptPlace;
  onPlaceChange?: (place: ManuscriptPlace) => void;
}) {
  const updateBlockText = useStore((s) => s.updateBlockText);
  const deleteBlock = useStore((s) => s.deleteBlock);

  if (book.manuscript.blocks.length === 0) {
    return (
      <div className="empty">
        Nothing here yet. Start dictating and your prose — with chapters and scene breaks — will
        appear here.
      </div>
    );
  }

  const report = (blockId: string, selStart?: number, selEnd?: number) => {
    onPlaceChange?.({
      scrollTop: place?.scrollTop ?? 0,
      blockId,
      selectionStart: selStart,
      selectionEnd: selEnd,
    });
  };

  let chapterNo = 0;
  return (
    <div className="manuscript">
      {book.manuscript.blocks.map((b) => {
        if (b.type === 'chapter') {
          chapterNo++;
          return (
            <div
              key={b.id}
              className="ms-chapter"
              data-block-id={b.id}
              onClick={() => report(b.id)}
            >
              <span className="badge chapter">CHAPTER {chapterNo}</span>
              {b.title || 'Untitled'}
            </div>
          );
        }
        if (b.type === 'scene') {
          return (
            <div
              key={b.id}
              className="ms-scene"
              data-block-id={b.id}
              onClick={() => report(b.id)}
            >
              {b.title || '* * *'}
            </div>
          );
        }
        if (b.type === 'section') {
          return (
            <div
              key={b.id}
              className="ms-section"
              data-block-id={b.id}
              onClick={() => report(b.id)}
            >
              {b.title || 'Section'}
            </div>
          );
        }
        return (
          <div key={b.id} className="ms-para" data-block-id={b.id} title="Click to edit">
            <AutoTextarea
              value={b.text ?? ''}
              onChange={(v) => updateBlockText(book.id, b.id, v)}
              onPlace={(start, end) => report(b.id, start, end)}
            />
            <button
              className="btn ghost"
              style={{ position: 'absolute', right: 0, top: 0, padding: '2px 8px', fontSize: 11 }}
              onClick={() => deleteBlock(book.id, b.id)}
              aria-label="Delete paragraph"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
