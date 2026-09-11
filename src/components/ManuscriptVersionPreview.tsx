import type { Block } from '../core/types';
import { chapterOrder } from '../core/manuscript';

export function ManuscriptVersionPreview({ blocks }: { blocks: Block[] }) {
  const chapterNoById = new Map(chapterOrder(blocks).map((c) => [c.id, c.number]));

  if (!blocks.length) {
    return <p className="hint">This version is empty.</p>;
  }

  return (
    <div className="ms-version-preview-doc">
      {blocks.map((b) => {
        if (b.type === 'chapter') {
          const n = chapterNoById.get(b.id) ?? 0;
          return (
            <div key={b.id} className="ms-chapter">
              <span className="badge chapter">CHAPTER {n}</span>
              <div className="ms-version-heading">{b.title?.trim() || 'Untitled'}</div>
            </div>
          );
        }
        if (b.type === 'scene') {
          return (
            <div key={b.id} className="ms-scene">
              <div className="ms-version-heading">{b.title?.trim() || '* * *'}</div>
            </div>
          );
        }
        if (b.type === 'section') {
          return (
            <div key={b.id} className="ms-section">
              <div className="ms-version-heading">{b.title?.trim() || 'Section'}</div>
            </div>
          );
        }
        if (b.type === 'image') {
          return (
            <p key={b.id} className="hint">
              Image{b.image?.caption ? `: ${b.image.caption}` : ''}
            </p>
          );
        }
        if (b.type === 'table') {
          return (
            <p key={b.id} className="hint">
              Table
            </p>
          );
        }
        return (
          <p key={b.id} className="ms-version-para">
            {b.text?.trim() || ' '}
          </p>
        );
      })}
    </div>
  );
}
