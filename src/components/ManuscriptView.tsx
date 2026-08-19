import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Block, Book, InlineMark } from '../core/types';
import {
  chapterOrder,
  destFromPlace,
  movableRange,
  validDropIndices,
  type ManuscriptInsertAt,
  type ManuscriptInsertKind,
} from '../core/manuscript';
import type { ManuscriptPlace } from '../core/persistedState';
import { offsetsFromDomRange } from '../core/dictationDraft';
import { ingestManuscriptImage } from '../core/mediaStore';
import { mimeFromFile } from '../core/manuscriptMedia';
import { AppContextMenu, type AppContextMenuItem } from './AppContextMenu';
import { RichParagraph } from './RichParagraph';
import { ManuscriptImageFrame } from './ManuscriptImageFrame';

const DRAG_MIME = 'application/x-sf-block';

function destFromEvent(
  e: React.MouseEvent | React.DragEvent,
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
        : blockEl.querySelector('textarea, input');
    if (ta instanceof HTMLTextAreaElement || ta instanceof HTMLInputElement) {
      return {
        atBlockId,
        atIndex: atIndex >= 0 ? atIndex : undefined,
        splitOffset: ta.selectionStart ?? undefined,
      };
    }
    const editor = blockEl.querySelector('.ms-para-editor');
    if (editor instanceof HTMLElement) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        const { start } = offsetsFromDomRange(editor, sel.getRangeAt(0));
        return {
          atBlockId,
          atIndex: atIndex >= 0 ? atIndex : undefined,
          splitOffset: start,
        };
      }
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
    { id: 'insert-chapter', label: 'Insert new chapter', group: 'structure' },
    { id: 'insert-scene', label: 'Insert new scene', group: 'structure' },
    { id: 'insert-section', label: 'Insert new section', group: 'structure' },
    { id: 'insert-paragraph', label: 'Insert new paragraph', group: 'structure' },
    { id: 'insert-image', label: 'Insert image', group: 'media' },
  ];
}

export function ManuscriptView({
  book,
  place,
  onPlaceChange,
  canInsertDictation,
  onInsertDictation,
  onPickImage,
}: {
  book: Book;
  place?: ManuscriptPlace;
  onPlaceChange?: (place: ManuscriptPlace) => void;
  canInsertDictation?: boolean;
  onInsertDictation?: (dest: ManuscriptInsertAt) => void;
  onPickImage?: (dest: ManuscriptInsertAt) => void;
}) {
  const updateBlockText = useStore((s) => s.updateBlockText);
  const updateBlockTitle = useStore((s) => s.updateBlockTitle);
  const deleteBlock = useStore((s) => s.deleteBlock);
  const moveManuscriptRange = useStore((s) => s.moveManuscriptRange);
  const insertManuscriptStructure = useStore((s) => s.insertManuscriptStructure);
  const insertManuscriptImage = useStore((s) => s.insertManuscriptImage);
  const formatManuscript = useStore((s) => s.formatManuscript);
  const updateImageCaption = useStore((s) => s.updateImageCaption);
  const updateImageAlt = useStore((s) => s.updateImageAlt);
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

  const insertImageAt = async (dest: ManuscriptInsertAt, files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      const mime = mimeFromFile(file);
      if (!mime) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ingested = await ingestManuscriptImage({
        bytes,
        mime,
        name: file.name,
        alt: file.name.replace(/\.[^.]+$/, ''),
      });
      if (!ingested.ok) continue;
      insertManuscriptImage(book.id, ingested.image, dest);
    }
  };

  const onMenuSelect = (id: string) => {
    if (!menu) return;
    if (id === 'insert-dictation-here') {
      onInsertDictation?.(menu.dest);
      return;
    }
    if (id === 'insert-image') {
      onPickImage?.(menu.dest);
      return;
    }
    const kind: ManuscriptInsertKind | null =
      id === 'insert-chapter'
        ? 'chapter'
        : id === 'insert-scene'
          ? 'scene'
          : id === 'insert-section'
            ? 'section'
            : id === 'insert-paragraph'
              ? 'paragraph'
              : null;
    if (kind) insertManuscriptStructure(book.id, kind, menu.dest);
  };

  const beginDrag = (e: React.DragEvent, index: number, block: Block) => {
    if ((e.target as HTMLElement).closest('input, textarea, button, [contenteditable="true"], .ms-para-editor')) {
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
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dropOver !== atIndex) setDropOver(atIndex);
      return;
    }
    if (dragFromRef.current == null || !dropOkRef.current.has(atIndex)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropOver !== atIndex) setDropOver(atIndex);
  };

  const dropOnGap = (e: React.DragEvent, atIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) {
      void insertImageAt({ atIndex }, e.dataTransfer.files);
      endDrag();
      return;
    }
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
    if (dragFrom != null || dropOver != null) {
      if (dropOk.has(atIndex) || dropOver === atIndex) classes.push('is-drop-ok');
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

  const formatAtPlace = (kind: 'b' | 'i' | 'u' | 'bold' | 'italic' | 'underline' | 'strike') => {
    const dest = destFromPlace(blocks, place);
    const blockId = dest?.atBlockId ?? place?.blockId;
    if (!blockId) return;
    const map = { b: 'bold', i: 'italic', u: 'underline' } as const;
    const mark = kind === 'b' || kind === 'i' || kind === 'u' ? map[kind] : kind;
    const start = place?.selectionStart ?? 0;
    const end = place?.selectionEnd ?? start;
    formatManuscript(book.id, blockId, { start, end }, { type: 'toggle', kind: mark });
  };

  if (blocks.length === 0) {
    return (
      <>
        <div
          className="empty"
          onContextMenu={openInsertMenu}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files?.length) return;
            e.preventDefault();
            void insertImageAt({ atIndex: 0 }, e.dataTransfer.files);
          }}
        >
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
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          void insertImageAt(destFromEvent(e, blocks), e.dataTransfer.files);
        }}
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
                <input
                  className="ms-scene-title"
                  value={b.title ?? ''}
                  placeholder="* * *"
                  aria-label="Scene title"
                  draggable={false}
                  onChange={(e) => updateBlockTitle(book.id, b.id, e.target.value)}
                  onFocus={(e) => report(b.id, e.target.selectionStart ?? 0, e.target.selectionEnd ?? 0)}
                />
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
                <input
                  className="ms-section-title"
                  value={b.title ?? ''}
                  placeholder="Section"
                  aria-label="Section title"
                  draggable={false}
                  onChange={(e) => updateBlockTitle(book.id, b.id, e.target.value)}
                  onFocus={(e) => report(b.id, e.target.selectionStart ?? 0, e.target.selectionEnd ?? 0)}
                />
              </div>
            );
          } else if (b.type === 'image' && b.image) {
            body = (
              <div
                className={dragging ? 'ms-image-block is-dragging' : 'ms-image-block'}
                data-block-id={b.id}
                draggable
                onDragStart={(e) => beginDrag(e, i, b)}
                onClick={() => report(b.id)}
              >
                <span
                  className="ms-drag-handle"
                  draggable
                  aria-label="Move image"
                  title="Move image"
                  onDragStart={(e) => {
                    e.stopPropagation();
                    beginDrag(e, i, b);
                  }}
                >
                  ⋮⋮
                </span>
                <ManuscriptImageFrame
                  image={b.image}
                  onCaption={(caption) => updateImageCaption(book.id, b.id, caption)}
                  onAlt={(alt) => updateImageAlt(book.id, b.id, alt)}
                />
                <button
                  className="btn ghost"
                  style={{ position: 'absolute', right: 0, top: 0, padding: '2px 8px', fontSize: 11 }}
                  onClick={() => deleteBlock(book.id, b.id)}
                  aria-label="Delete image"
                >
                  ✕
                </button>
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
                <RichParagraph
                  value={b.text ?? ''}
                  marks={b.marks}
                  onChange={(text: string, marks: InlineMark[]) => updateBlockText(book.id, b.id, text, marks)}
                  onPlace={(start, end) => report(b.id, start, end)}
                  onModKey={(key) => {
                    report(b.id, place?.selectionStart, place?.selectionEnd);
                    formatAtPlace(key);
                  }}
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
