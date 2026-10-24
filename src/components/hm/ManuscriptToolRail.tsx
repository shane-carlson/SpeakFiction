import type { StructureHeadingKind } from '../../hm/manuscript';

const STRUCTURE: Array<{ kind: 'chapter' | 'scene' | 'section' | 'paragraph'; short: string; label: string }> = [
  { kind: 'chapter', short: 'Chapter', label: 'New chapter' },
  { kind: 'scene', short: 'Scene', label: 'New scene' },
  { kind: 'section', short: 'Section', label: 'New section' },
  { kind: 'paragraph', short: 'Paragraph', label: 'New paragraph' },
];

const KINDS: Array<{ kind: StructureHeadingKind; label: string }> = [
  { kind: 'chapter', label: 'Chapter' },
  { kind: 'scene', label: 'Scene' },
  { kind: 'section', label: 'Section' },
  { kind: 'paragraph', label: 'Body' },
];

/** Compact labels beside the full manuscript bar. */
export function ManuscriptToolRail({
  heading,
  kindEnabled,
  onInsert,
  onSetKind,
  onClear,
  clearEnabled,
  pickingInsert,
  onTogglePicking,
  selecting,
  onToggleSelecting,
}: {
  heading: StructureHeadingKind | null;
  kindEnabled: boolean;
  onInsert: (kind: 'chapter' | 'scene' | 'section' | 'paragraph') => void;
  onSetKind: (kind: StructureHeadingKind) => void;
  onClear: () => void;
  clearEnabled: boolean;
  pickingInsert: boolean;
  onTogglePicking: () => void;
  selecting: boolean;
  onToggleSelecting: () => void;
}) {
  return (
    <div className="toolbar-rail" role="toolbar" aria-label="Compact manuscript tools">
      <div className="toolbar-rail__group">
        {STRUCTURE.map((item) => (
          <button key={item.kind} type="button" title={item.label} onClick={() => onInsert(item.kind)}>
            {item.short}
          </button>
        ))}
      </div>
      <div className="toolbar-rail__group">
        <span className="toolbar-rail__label">Heading</span>
        <div className="toolbar-rail__kinds">
          {KINDS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={heading === item.kind ? 'is-active' : undefined}
              disabled={!kindEnabled}
              aria-pressed={heading === item.kind}
              onClick={() => onSetKind(item.kind)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="toolbar-rail__group">
        <button type="button" disabled={!clearEnabled} onClick={onClear} title="Clear format">
          Clear
        </button>
        <button
          type="button"
          className={pickingInsert ? 'is-active' : undefined}
          aria-pressed={pickingInsert}
          title={
            pickingInsert
              ? 'Click a gap in the manuscript, or click again to cancel'
              : 'Turn on, then click a gap to mark where dictation lands'
          }
          onClick={onTogglePicking}
        >
          Insert point
        </button>
        <button
          type="button"
          className={selecting ? 'is-active' : undefined}
          aria-pressed={selecting}
          title="Use this to select paragraphs to combine or delete"
          onClick={onToggleSelecting}
        >
          Select
        </button>
      </div>
    </div>
  );
}
