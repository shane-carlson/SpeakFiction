import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Block, Book } from '../core/types';
import {
  chapterOrder,
  movableRange,
  validDropIndices,
  type ManuscriptInsertAt,
  type ManuscriptInsertKind,
} from '../core/manuscript';
import type { ManuscriptPlace } from '../core/persistedState';
import { AppContextMenu, type AppContextMenuItem } from './AppContextMenu';

const DRAG_MIME = 'application/x-sf-block';

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
      target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
        ? target
        : blockEl.querySelector('textarea');
    if (ta instanceof HTMLTextAreaElement || ta instanceof HTMLInputElement) {
      return {
        atBlockId,
        atIndex: atIndex >= 0 ? atIndex : undefined,
        splitOffset: ta.selectionStart ?? undefined,
      };
    }
    return { atBlockId, atIndex: atIndex >= 0 ? atIndex : undefined };
  }
  return { atIndex: blocks.length };
}

function DragHandle({ label }: { label: string }) {
  return (
    <span className="ms-drag-handle" draggable={false} aria-hidden="true" title={label}>
      ⋮⋮
    </span>
  );
}

function manuscriptMenuItems(canInsertDictation: boolean): AppContextMenuItem[] {
  return [
    {
      id: 'insert-dictation-here',
      label: 'Insert dictation here',
      group: 'insert',
      disabled: !canInsertDictation,
    },
    { id: 'insert-scene', label: 'Insert new scene', group: 'structure' },
    { id: 'insert-paragraph', label: 'Insert new paragraph', group: 'structure' },
  ];
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
  const updateBlockTitle = useStore((s) => s.updateBlockTitle);
  const deleteBlock = useStore((s) => s.deleteBlock);
  const moveManuscriptRange = useStore((s) => s.moveManuscriptRange);
  const insertManuscriptStructure = useStore((s) => s.insertManuscriptStructure);
  const [menu, setMenu] = useState<{ x: number; y: number; dest: ManuscriptInsertAt } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dropOkRef = useRef<Set<number>>(new Set());
  const closeMenu = useCallback(() => setMenu(null), []);

  const blocks = book.manuscript.blocks;
  const chapterNoById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of chapterOrder(blocks)) map.set(c.id, c.number);
    return map;
  }, [blocks]);

  const dropOk = useMemo(() => {
    if (dragFrom == null) return new Set<number>();
    return new Set(validDropIndices(blocks, dragFrom));
  }, [blocks, dragFrom]);

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
    const dest = destFromEvent(e, blocks);
    if (dest.atBlockId) {
      report(dest.atBlockId, dest.splitOffset, dest.splitOffset);
    }
    setMenu({ x: e.clientX, y: e.clientY, dest });
  };

  const onMenuSelect = (id: string) => {
    if (!menu) return;
    if (id === 'insert-dictation-here') {
      onInsertDictation?.(menu.dest);
      return;
    }
    const kind: ManuscriptInsertKind | null =
      id === 'insert-scene' ? 'scene' : id === 'insert-paragraph' ? 'paragraph' : null;
    if (kind) insertManuscriptStructure(book.id, kind, menu.dest);
  };

  const beginDrag = (e: React.DragEvent, index: number, block: Block) => {
    if ((e.target as HTMLElement).closest('input, textarea, button')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: block.id, index }));
    e.dataTransfer.setData('text/plain', block.title || block.text || block.type);
    dragFromRef.current = index;
    dropOkRef.current = new Set(validDropIndices(blocks, index));
    requestAnimationFrame(() => {
      setDragFrom(index);
      setDropOver(null);
    });
  };

  const endDrag = () => {
    dragFromRef.current = null;
    dropOkRef.current = new Set();
    setDragFrom(null);
    setDropOver(null);
  };

  const allowGapDrop = (e: React.DragEvent, atIndex: number) => {
    if (dragFromRef.current == null || !dropOkRef.current.has(atIndex)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropOver !== atIndex) setDropOver(atIndex);
  };

  const dropOnGap = (e: React.DragEvent, atIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const from = dragFromRef.current;
    if (from == null || !dropOkRef.current.has(atIndex)) {
      endDrag();
      return;
    }
    moveManuscriptRange(book.id, from, atIndex);
    endDrag();
  };

  const insertMenu = menu ? (
    <AppContextMenu
      x={menu.x}
      y={menu.y}
      items={manuscriptMenuItems(Boolean(canInsertDictation))}
      onClose={closeMenu}
      onSelect={onMenuSelect}
    />
  ) : null;

  const gapClass = (atIndex: number) => {
    const classes = ['ms-insert-gap'];
    if (dragFrom != null) {
      if (dropOk.has(atIndex)) classes.push('is-drop-ok');
      if (dropOver === atIndex) classes.push('is-drop-over');
    }
    return classes.join(' ');
  };

  const insertGap = (atIndex: number) => (
    <div
      className={gapClass(atIndex)}
      data-insert-index={atIndex}
      onDragOver={(e) => allowGapDrop(e, atIndex)}
      onDragEnter={(e) => allowGapDrop(e, atIndex)}
      onDragLeave={() => {
        if (dropOver === atIndex) setDropOver(null);
      }}
      onDrop={(e) => dropOnGap(e, atIndex)}
    />
  );

  if (blocks.length === 0) {
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

  const dragRange = dragFrom != null ? movableRange(blocks, dragFrom) : null;

  return (
    <>
      <div
        className={dragFrom != null ? 'manuscript is-dragging' : 'manuscript'}
        onContextMenu={openInsertMenu}
        onDragEnd={endDrag}
      >
        {insertGap(0)}
        {blocks.map((b, i) => {
          const dragging = dragRange != null && i >= dragRange.start && i < dragRange.end;
          let body: JSX.Element;
          if (b.type === 'chapter') {
            const chapterNo = chapterNoById.get(b.id) ?? 0;
            body = (
              <div
                className={dragging ? 'ms-chapter is-dragging' : 'ms-chapter'}
                data-block-id={b.id}
                draggable
                onDragStart={(e) => beginDrag(e, i, b)}
                onClick={() => report(b.id)}
              >
                <DragHandle label="Move chapter" />
                <span className="badge chapter">CHAPTER {chapterNo}</span>
                <input
                  className="ms-chapter-title"
                  value={b.title ?? ''}
                  placeholder="Untitled"
                  aria-label={`Chapter ${chapterNo} title`}
                  draggable={false}
                  onChange={(e) => updateBlockTitle(book.id, b.id, e.target.value)}
                  onFocus={(e) => report(b.id, e.target.selectionStart ?? 0, e.target.selectionEnd ?? 0)}
                  onSelect={(e) =>
                    report(b.id, e.currentTarget.selectionStart ?? 0, e.currentTarget.selectionEnd ?? 0)
                  }
                />
              </div>
            );
          } else if (b.type === 'scene') {
            body = (
              <div
                className={dragging ? 'ms-scene is-dragging' : 'ms-scene'}
                data-block-id={b.id}
                draggable
                onDragStart={(e) => beginDrag(e, i, b)}
                onClick={() => report(b.id)}
              >
                <DragHandle label="Move scene" />
                <span className="ms-scene-label">{b.title || '* * *'}</span>
              </div>
            );
          } else if (b.type === 'section') {
            body = (
              <div
                className={dragging ? 'ms-section is-dragging' : 'ms-section'}
                data-block-id={b.id}
                draggable
                onDragStart={(e) => beginDrag(e, i, b)}
                onClick={() => report(b.id)}
              >
                <DragHandle label="Move section" />
                <span>{b.title || 'Section'}</span>
              </div>
            );
          } else {
            body = (
              <div
                className={dragging ? 'ms-para is-dragging' : 'ms-para'}
                data-block-id={b.id}
                title="Click to edit"
              >
                <span
                  className="ms-drag-handle"
                  draggable
                  aria-label="Move paragraph"
                  title="Move paragraph"
                  onDragStart={(e) => {
                    e.stopPropagation();
                    beginDrag(e, i, b);
                  }}
                >
                  ⋮⋮
                </span>
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
              {insertGap(i + 1)}
            </Fragment>
          );
        })}
      </div>
      {insertMenu}
    </>
  );
}
