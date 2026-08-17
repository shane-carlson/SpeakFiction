import { useStore } from '../store';
import type { Book } from '../core/types';

function AutoTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      rows={Math.max(1, Math.ceil(value.length / 90))}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
    />
  );
}

export function ManuscriptView({ book }: { book: Book }) {
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

  let chapterNo = 0;
  return (
    <div className="manuscript">
      {book.manuscript.blocks.map((b) => {
        if (b.type === 'chapter') {
          chapterNo++;
          return (
            <div key={b.id} className="ms-chapter">
              <span className="badge chapter">CHAPTER {chapterNo}</span>
              {b.title || 'Untitled'}
            </div>
          );
        }
        if (b.type === 'scene') {
          return (
            <div key={b.id} className="ms-scene">
              {b.title || '* * *'}
            </div>
          );
        }
        if (b.type === 'section') {
          return (
            <div key={b.id} className="ms-section">
              {b.title || 'Section'}
            </div>
          );
        }
        return (
          <div key={b.id} className="ms-para" title="Click to edit">
            <AutoTextarea value={b.text ?? ''} onChange={(v) => updateBlockText(book.id, b.id, v)} />
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
