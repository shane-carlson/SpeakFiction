import { useState, useEffect, useRef } from 'react';
import type { Block, InlineMarkKind } from '../core/types';
import type { ManuscriptInsertKind, StructureHeadingKind } from '../core/manuscript';
import { TableGridPicker } from './TableGridPicker';

const STRUCTURE_BUTTONS: Array<{ kind: ManuscriptInsertKind; label: string; short: string }> = [
  { kind: 'chapter', label: 'New chapter', short: 'Chapter' },
  { kind: 'scene', label: 'New scene', short: 'Scene' },
  { kind: 'section', label: 'New section', short: 'Section' },
  { kind: 'paragraph', label: 'New paragraph', short: 'Paragraph' },
];

const HEADING_BUTTONS: Array<{ kind: StructureHeadingKind; label: string }> = [
  { kind: 'chapter', label: 'Chapter' },
  { kind: 'scene', label: 'Scene' },
  { kind: 'section', label: 'Section' },
  { kind: 'paragraph', label: 'Body' },
];

const FORMAT_BUTTONS: Array<{ kind: InlineMarkKind; label: string; hint: string }> = [
  { kind: 'bold', label: 'B', hint: 'Bold' },
  { kind: 'italic', label: 'I', hint: 'Italic' },
  { kind: 'underline', label: 'U', hint: 'Underline' },
  { kind: 'strike', label: 'S', hint: 'Strikethrough' },
];

function ImageGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <circle cx="5.4" cy="6.1" r="1.15" fill="currentColor" />
      <path
        d="M2.2 12.2l3.6-3.7 2.2 2.1 2.6-3.1 3.2 4.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TableGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path d="M1.5 8h13M8 2.5v11" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

function ParagraphActionsMenu({
  count,
  onCombine,
  onDelete,
}: {
  count: number;
  onCombine?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    const onPointer = (e: Event) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="ms-toolbar-actions">
      <button
        type="button"
        className={`btn compact${open ? ' primary' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={count === 1 ? 'Actions for 1 selected paragraph' : `Actions for ${count} selected paragraphs`}
        title="Combine, delete, or act on the selected paragraphs"
        onClick={() => setOpen((v) => !v)}
      >
        Actions
      </button>
      {open && (
        <div
          className="ms-toolbar-actions-menu card"
          role="menu"
          aria-label="Paragraph actions"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="btn ghost compact"
            disabled={count < 2 || !onCombine}
            title={count < 2 ? 'Select at least two paragraphs' : 'Join selected paragraphs in document order'}
            onClick={() => {
              onCombine?.();
              setOpen(false);
            }}
          >
            Combine
          </button>
          <button
            type="button"
            role="menuitem"
            className="btn ghost compact"
            disabled={count < 1 || !onDelete}
            title="Delete the selected paragraphs"
            onClick={() => {
              onDelete?.();
              setOpen(false);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function ManuscriptToolbar({
  focused,
  canUndo,
  canRedo,
  editorOpen,
  layout = 'bar',
  onToggleEditor,
  onInsertStructure,
  onInsertImage,
  onInsertTable,
  onFormat,
  onClearFormat,
  onSetKind,
  onUndo,
  onRedo,
  pickingInsert = false,
  onTogglePickingInsert,
  onOpenVersions,
  findOpen = false,
  onToggleFind,
  selecting = false,
  onToggleSelecting,
  selectedParagraphCount = 0,
  onCombineParagraphs,
  onDeleteParagraphs,
}: {
  focused?: Block;
  canUndo: boolean;
  canRedo: boolean;
  editorOpen: boolean;
  layout?: 'bar' | 'rail';
  onToggleEditor: () => void;
  onInsertStructure: (kind: ManuscriptInsertKind) => void;
  onInsertImage: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onFormat: (kind: InlineMarkKind) => void;
  onClearFormat: () => void;
  onSetKind: (kind: StructureHeadingKind) => void;
  onUndo: () => void;
  onRedo: () => void;
  pickingInsert?: boolean;
  onTogglePickingInsert?: () => void;
  onOpenVersions?: () => void;
  findOpen?: boolean;
  onToggleFind?: () => void;
  selecting?: boolean;
  onToggleSelecting?: () => void;
  selectedParagraphCount?: number;
  onCombineParagraphs?: () => void;
  onDeleteParagraphs?: () => void;
}) {
  const heading = focused && focused.type !== 'image' && focused.type !== 'table' ? focused.type : null;
  const formatEnabled = focused?.type === 'paragraph';
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className={`ms-toolbar${layout === 'rail' ? ' ms-toolbar-rail' : ''}`}
      role="toolbar"
      aria-label="Manuscript editor"
    >
      <div className="ms-toolbar-group ms-toolbar-structure">
        {STRUCTURE_BUTTONS.map((b) => (
          <button key={b.kind} type="button" className="btn compact" onClick={() => onInsertStructure(b.kind)}>
            {layout === 'rail' ? b.short : b.label}
          </button>
        ))}
      </div>
      <div className="ms-toolbar-group ms-toolbar-format">
        {FORMAT_BUTTONS.map((b) => (
          <button
            key={b.kind}
            type="button"
            className={`btn compact ms-format-${b.kind}`}
            title={b.hint}
            disabled={!formatEnabled}
            onClick={() => onFormat(b.kind)}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          className="btn compact ms-format-icon"
          title="Insert image"
          aria-label="Insert image"
          onClick={onInsertImage}
        >
          <ImageGlyph />
        </button>
        <button
          type="button"
          className="btn compact ms-format-icon"
          title="Insert table"
          aria-label="Insert table"
          aria-haspopup="dialog"
          aria-expanded={Boolean(tableMenu)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setTableMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <TableGlyph />
        </button>
        <button type="button" className="btn compact ghost" disabled={!formatEnabled} onClick={onClearFormat}>
          {layout === 'rail' ? 'Clear' : 'Clear format'}
        </button>
      </div>
      <div className="ms-toolbar-group">
        {layout !== 'rail' && <span className="ms-toolbar-label">Heading</span>}
        <div className="ms-toolbar-heading-btns">
          {HEADING_BUTTONS.map((b) => (
            <button
              key={b.kind}
              type="button"
              className={`btn compact${heading === b.kind ? ' primary' : ''}`}
              disabled={!focused || focused.type === 'image' || focused.type === 'table'}
              onClick={() => onSetKind(b.kind)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ms-toolbar-group ms-toolbar-end">
        {onTogglePickingInsert && (
          <button
            type="button"
            className={`btn compact${pickingInsert ? ' primary' : ' ghost'}`}
            aria-pressed={pickingInsert}
            title={
              pickingInsert
                ? 'Click a gap in the manuscript, or click again to cancel'
                : 'Turn on, then click a gap to mark where dictation lands'
            }
            onClick={onTogglePickingInsert}
          >
            {layout === 'rail' ? 'Insert point' : 'Choose insertion point'}
          </button>
        )}
        {onToggleSelecting && (
          <button
            type="button"
            className={`btn compact${selecting ? ' primary' : ' ghost'}`}
            aria-pressed={selecting}
            title={
              selecting
                ? 'Click paragraphs below to select them, or click again to finish'
                : 'Select paragraphs to combine, delete, or act on'
            }
            onClick={onToggleSelecting}
          >
            Select
          </button>
        )}
        {selecting && selectedParagraphCount > 0 && (
          <ParagraphActionsMenu
            count={selectedParagraphCount}
            onCombine={onCombineParagraphs}
            onDelete={onDeleteParagraphs}
          />
        )}
        {onToggleFind && (
          <button
            type="button"
            className={`btn compact${findOpen ? ' primary' : ' ghost'}`}
            aria-pressed={findOpen}
            title="Find and replace (⌘F)"
            onClick={onToggleFind}
          >
            Find
          </button>
        )}
        <button type="button" className="btn compact ghost" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="btn compact ghost" disabled={!canRedo} onClick={onRedo}>
          Redo
        </button>
        {onOpenVersions && (
          <button
            type="button"
            className="btn compact ghost"
            onClick={onOpenVersions}
            title="Review previous versions of this manuscript"
          >
            Versions
          </button>
        )}
        <button
          type="button"
          className="btn compact"
          onClick={onToggleEditor}
          aria-pressed={editorOpen}
          title={editorOpen ? 'Exit full-screen editor (Esc)' : 'Full-screen manuscript editor'}
        >
          {editorOpen ? 'Exit' : 'Full screen'}
        </button>
      </div>
      {tableMenu && (
        <TableGridPicker
          x={tableMenu.x}
          y={tableMenu.y}
          onClose={() => setTableMenu(null)}
          onSelect={(rows, cols) => {
            setTableMenu(null);
            onInsertTable(rows, cols);
          }}
        />
      )}
    </div>
  );
}
