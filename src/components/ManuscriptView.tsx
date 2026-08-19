import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { buildManuscriptContextMenu, applyChapterHeadingMenuAction } from '../core/manuscriptContextMenu';
import {
  SPELLCHECK_ADD_ID,
  manuscriptSpellcheckGate,
  replaceMisspelledInMarkedText,
  replaceMisspelledWord,
  suggestionFromMenuId,
  type SpellcheckHit,
} from '../core/spellcheckMenu';
import { AppContextMenu } from './AppContextMenu';
import { ChapterRemoveControl } from './ChapterRemoveControl';
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

type SpellField = 'text' | 'title' | 'caption' | 'alt';

function spellFieldFromTarget(target: EventTarget | null): SpellField | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('.ms-para-editor')) return 'text';
  if (target.closest('.ms-image-caption')) return 'caption';
  if (target.closest('.ms-image-alt')) return 'alt';
  if (target.closest('.ms-chapter-title, .ms-scene-title, .ms-section-title')) return 'title';
  return null;
}

function applyManuscriptSpellReplace(
  bookId: string,
  dest: ManuscriptInsertAt,
  field: SpellField | null | undefined,
  spell: SpellcheckHit | null | undefined,
  suggestion: string,
) {
  const word = spell?.misspelledWord;
  if (!word) return;
  const store = useStore.getState();
  const book = store.books.find((b) => b.id === bookId);
  const block = dest.atBlockId
    ? book?.manuscript.blocks.find((b) => b.id === dest.atBlockId)
    : undefined;
  if (!block) return;
  const around = dest.splitOffset;
  if (field === 'caption' && block.type === 'image') {
    store.updateImageCaption(
      bookId,
      block.id,
      replaceMisspelledWord(block.image?.caption ?? '', word, suggestion, around),
    );
    return;
  }
  if (field === 'alt' && block.type === 'image') {
    store.updateImageAlt(
      bookId,
      block.id,
      replaceMisspelledWord(block.image?.alt ?? '', word, suggestion, around),
    );
    return;
  }
  if (block.type === 'paragraph' && (field === 'text' || !field)) {
    const next = replaceMisspelledInMarkedText(block.text ?? '', block.marks, word, suggestion, around);
    store.updateBlockText(bookId, block.id, next.text, next.marks);
    return;
  }
  if (block.type === 'chapter' || block.type === 'scene' || block.type === 'section') {
    store.updateBlockTitle(
      bookId,
      block.id,
      replaceMisspelledWord(block.title ?? '', word, suggestion, around),
    );
  }
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
  const unwrapHeading = useStore((s) => s.unwrapHeading);
  const deleteBlockRange = useStore((s) => s.deleteBlockRange);
  const moveManuscriptRange = useStore((s) => s.moveManuscriptRange);
  const insertManuscriptStructure = useStore((s) => s.insertManuscriptStructure);
  const insertManuscriptImage = useStore((s) => s.insertManuscriptImage);
  const formatManuscript = useStore((s) => s.formatManuscript);
  const updateImageCaption = useStore((s) => s.updateImageCaption);
  const updateImageAlt = useStore((s) => s.updateImageAlt);
  const updateTableCell = useStore((s) => s.updateTableCell);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    dest: ManuscriptInsertAt;
    chapterHeading?: boolean;
    field?: SpellField | null;
    spell?: SpellcheckHit | null;
  } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const dropOkRef = useRef<Set<number>>(new Set());
  const menuGen = useRef(0);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    return window.speakfiction?.spellcheck?.onContextMenu?.((hit) => {
      manuscriptSpellcheckGate.offer(hit);
    });
  }, []);

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
    const destBlock = dest.atBlockId ? blocks.find((b) => b.id === dest.atBlockId) : undefined;
    const chapterHeading = destBlock?.type === 'chapter';
    if (dest.atBlockId) {
      report(dest.atBlockId, dest.splitOffset, dest.splitOffset);
    }
    const token = ++menuGen.current;
    const field = spellFieldFromTarget(e.target);
    const base = { x: e.clientX, y: e.clientY, dest, field, chapterHeading };
    const waitMs = window.speakfiction?.spellcheck?.onContextMenu ? 150 : 0;
    const immediate = manuscriptSpellcheckGate.takeImmediate();
    if (immediate || waitMs === 0) {
      setMenu({ ...base, spell: immediate });
      return;
    }
    void manuscriptSpellcheckGate.take(waitMs).then((spell) => {
      if (token !== menuGen.current) return;
      setMenu({ ...base, spell });
    });
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
    const suggestion = suggestionFromMenuId(id);
    if (suggestion) {
      window.speakfiction?.spellcheck?.replace(suggestion);
      applyManuscriptSpellReplace(book.id, menu.dest, menu.field, menu.spell, suggestion);
      return;
    }
    if (id === SPELLCHECK_ADD_ID) {
      const word = menu.spell?.misspelledWord;
      if (word) window.speakfiction?.spellcheck?.addWord(word);
      return;
    }
    if (
      applyChapterHeadingMenuAction(id, {
        unwrapHeading: () => {
          if (menu.dest.atBlockId) unwrapHeading(book.id, menu.dest.atBlockId);
        },
        deleteChapter: () => {
          if (!menu.dest.atBlockId) return;
          const ok = window.confirm('Delete this chapter and all of its content?');
          if (ok) deleteBlockRange(book.id, menu.dest.atBlockId);
        },
      })
    ) {
      return;
    }
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
    if ((e.target as HTMLElement).closest('input, textarea, button, [contenteditable="true"], .ms-para-editor, .ms-chapter-remove')) {
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
      items={buildManuscriptContextMenu(Boolean(canInsertDictation), menu.spell, {
        chapterHeading: menu.chapterHeading,
      })}
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
                  spellCheck={true}
                  draggable={false}
                  onChange={(e) => updateBlockTitle(book.id, b.id, e.target.value)}
                  onFocus={(e) => report(b.id, e.target.selectionStart ?? 0, e.target.selectionEnd ?? 0)}
                  onSelect={(e) =>
                    report(b.id, e.currentTarget.selectionStart ?? 0, e.currentTarget.selectionEnd ?? 0)
                  }
                />
                <ChapterRemoveControl
                  onUnwrap={() => unwrapHeading(book.id, b.id)}
                  onDelete={() => {
                    const ok = window.confirm('Delete this chapter and all of its content?');
                    if (ok) deleteBlockRange(book.id, b.id);
                  }}
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
                  spellCheck={true}
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
                  spellCheck={true}
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
                  className="btn ghost ms-block-remove is-absolute"
                  onClick={() => deleteBlock(book.id, b.id)}
                  aria-label="Delete image"
                >
                  ✕
                </button>
              </div>
            );
          } else if (b.type === 'table' && b.table) {
            const cols = Math.max(0, ...b.table.rows.map((r) => r.length));
            body = (
              <div
                className={dragging ? 'ms-table-block is-dragging' : 'ms-table-block'}
                data-block-id={b.id}
                draggable
                onDragStart={(e) => beginDrag(e, i, b)}
                onClick={() => report(b.id)}
              >
                <span
                  className="ms-drag-handle"
                  draggable
                  aria-label="Move table"
                  title="Move table"
                  onDragStart={(e) => {
                    e.stopPropagation();
                    beginDrag(e, i, b);
                  }}
                >
                  ⋮⋮
                </span>
                <table className="ms-table">
                  <tbody>
                    {b.table.rows.map((row, ri) => (
                      <tr key={ri}>
                        {Array.from({ length: cols }, (_, ci) => (
                          <td key={ci}>
                            <input
                              className="ms-table-cell"
                              value={row[ci]?.text ?? ''}
                              aria-label={`Table cell row ${ri + 1} column ${ci + 1}`}
                              spellCheck={true}
                              draggable={false}
                              onChange={(e) => updateTableCell(book.id, b.id, ri, ci, e.target.value)}
                              onFocus={(e) =>
                                report(b.id, e.target.selectionStart ?? 0, e.target.selectionEnd ?? 0)
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  className="btn ghost ms-block-remove is-absolute"
                  onClick={() => deleteBlock(book.id, b.id)}
                  aria-label="Delete table"
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
                  className="btn ghost ms-block-remove is-absolute"
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
