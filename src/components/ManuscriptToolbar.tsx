import type { Block, InlineMarkKind } from '../core/types';
import type { ManuscriptInsertKind, StructureHeadingKind } from '../core/manuscript';

const STRUCTURE_BUTTONS: Array<{ kind: ManuscriptInsertKind; label: string }> = [
  { kind: 'chapter', label: 'New chapter' },
  { kind: 'scene', label: 'New scene' },
  { kind: 'section', label: 'New section' },
  { kind: 'paragraph', label: 'New paragraph' },
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

export function ManuscriptToolbar({
  focused,
  canUndo,
  canRedo,
  editorOpen,
  layout = 'bar',
  onToggleEditor,
  onInsertStructure,
  onInsertImage,
  onFormat,
  onClearFormat,
  onSetKind,
  onUndo,
  onRedo,
}: {
  focused?: Block;
  canUndo: boolean;
  canRedo: boolean;
  editorOpen: boolean;
  layout?: 'bar' | 'rail';
  onToggleEditor: () => void;
  onInsertStructure: (kind: ManuscriptInsertKind) => void;
  onInsertImage: () => void;
  onFormat: (kind: InlineMarkKind) => void;
  onClearFormat: () => void;
  onSetKind: (kind: StructureHeadingKind) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const heading = focused && focused.type !== 'image' ? focused.type : null;
  const formatEnabled = focused?.type === 'paragraph';

  return (
    <div
      className={`ms-toolbar${layout === 'rail' ? ' ms-toolbar-rail' : ''}`}
      role="toolbar"
      aria-label="Manuscript editor"
    >
      <div className="ms-toolbar-group">
        {STRUCTURE_BUTTONS.map((b) => (
          <button key={b.kind} type="button" className="btn compact" onClick={() => onInsertStructure(b.kind)}>
            {b.label}
          </button>
        ))}
        <button type="button" className="btn compact" onClick={onInsertImage}>
          Insert image
        </button>
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
        <button type="button" className="btn compact ghost" disabled={!formatEnabled} onClick={onClearFormat}>
          Clear format
        </button>
      </div>
      <div className="ms-toolbar-group">
        <span className="ms-toolbar-label">Heading</span>
        <div className="ms-toolbar-heading-btns">
          {HEADING_BUTTONS.map((b) => (
            <button
              key={b.kind}
              type="button"
              className={`btn compact${heading === b.kind ? ' primary' : ''}`}
              disabled={!focused || focused.type === 'image'}
              onClick={() => onSetKind(b.kind)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="ms-toolbar-group ms-toolbar-end">
        <button type="button" className="btn compact ghost" disabled={!canUndo} onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="btn compact ghost" disabled={!canRedo} onClick={onRedo}>
          Redo
        </button>
        <button
          type="button"
          className="btn compact"
          onClick={onToggleEditor}
          aria-pressed={editorOpen}
          title={editorOpen ? 'Exit full-screen editor (Esc)' : 'Full-screen manuscript editor'}
        >
          {editorOpen ? 'Exit editor' : 'Full screen'}
        </button>
      </div>
    </div>
  );
}
