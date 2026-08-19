import { Fragment, useCallback, useState } from 'react';
import { useStore } from '../store';
import type { Book } from '../core/types';
import type { ManuscriptInsertAt } from '../core/manuscript';
import type { ManuscriptPlace } from '../core/persistedState';
import { AppContextMenu } from './AppContextMenu';

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

function destFromEvent(
  e: React.MouseEvent,
  blocks: Book['manuscript']['blocks'],
): ManuscriptInsertAt {
  const target = e.target as HTMLElement | null;
  const gap = target?.closest?.('[data-insert-index]');
  if (gap instanceof HTMLElement) {
    const atIndex = Number(gap.dataset.insertIndex);
    if (Number.isFinite(atIndex)) return { atIndex };
  }
  const blockEl = target?.closest?.('[data-block-id]');
  if (blockEl instanceof HTMLElement && blockEl.dataset.blockId) {
    const atBlockId = blockEl.dataset.blockId;
    const atIndex = blocks.findIndex((b) => b.id === atBlockId);
    const ta =
      target instanceof HTMLTextAreaElement ? target : blockEl.querySelector('textarea');
    if (ta instanceof HTMLTextAreaElement) {
      return {
        atBlockId,
        atIndex: atIndex >= 0 ? atIndex : undefined,
        splitOffset: ta.selectionStart,
      };
    }
    return { atBlockId, atIndex: atIndex >= 0 ? atIndex : undefined };
  }
  return { atIndex: blocks.length };
}

export function ManuscriptView({
  book,
  place,
  onPlaceChange,
  canInsertDictation,
  onInsertDictation,
}: {
  book: Book;
  place?: ManuscriptPlace;
  onPlaceChange?: (place: ManuscriptPlace) => void;
  canInsertDictation?: boolean;
  onInsertDictation?: (dest: ManuscriptInsertAt) => void;
}) {
  const updateBlockText = useStore((s) => s.updateBlockText);
  const deleteBlock = useStore((s) => s.deleteBlock);
  const [menu, setMenu] = useState<{ x: number; y: number; dest: ManuscriptInsertAt } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const report = (blockId: string, selStart?: number, selEnd?: number) => {
    onPlaceChange?.({
      scrollTop: place?.scrollTop ?? 0,
      blockId,
      selectionStart: selStart,
      selectionEnd: selEnd,
    });
  };

  const openInsertMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dest = destFromEvent(e, book.manuscript.blocks);
    if (dest.atBlockId) {
      report(dest.atBlockId, dest.splitOffset, dest.splitOffset);
    }
    setMenu({ x: e.clientX, y: e.clientY, dest });
  };

  const insertMenu = menu ? (
    <AppContextMenu
      x={menu.x}
      y={menu.y}
      items={[
        {
          id: 'insert-dictation-here',
          label: 'Insert dictation here',
          group: 'insert',
          disabled: !canInsertDictation,
        },
      ]}
      onClose={closeMenu}
      onSelect={() => onInsertDictation?.(menu.dest)}
    />
  ) : null;

  if (book.manuscript.blocks.length === 0) {
    return (
      <>
        <div className="empty" onContextMenu={openInsertMenu}>
          Nothing here yet. Start dictating and your prose — with chapters and scene breaks — will
          appear here.
        </div>
        {insertMenu}
      </>
    );
  }

  let chapterNo = 0;
  return (
    <>
      <div className="manuscript" onContextMenu={openInsertMenu}>
        <div className="ms-insert-gap" data-insert-index={0} />
        {book.manuscript.blocks.map((b, i) => {
          let body: JSX.Element;
          if (b.type === 'chapter') {
            chapterNo++;
            body = (
              <div className="ms-chapter" data-block-id={b.id} onClick={() => report(b.id)}>
                <span className="badge chapter">CHAPTER {chapterNo}</span>
                {b.title || 'Untitled'}
              </div>
            );
          } else if (b.type === 'scene') {
            body = (
              <div className="ms-scene" data-block-id={b.id} onClick={() => report(b.id)}>
                {b.title || '* * *'}
              </div>
            );
          } else if (b.type === 'section') {
            body = (
              <div className="ms-section" data-block-id={b.id} onClick={() => report(b.id)}>
                {b.title || 'Section'}
              </div>
            );
          } else {
            body = (
              <div className="ms-para" data-block-id={b.id} title="Click to edit">
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
          }
          return (
            <Fragment key={b.id}>
              {body}
              <div className="ms-insert-gap" data-insert-index={i + 1} />
            </Fragment>
          );
        })}
      </div>
      {insertMenu}
    </>
  );
}
