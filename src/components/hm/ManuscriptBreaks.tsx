import { dividerDisplayText } from '../../hm/manuscript';
import type { DividerStyle } from '../../hm/types';

export function ManuscriptPageBreak() {
  return (
    <div className="ms-page-break" role="separator" aria-label="Page break">
      <span className="ms-page-break__line" />
      <span className="ms-page-break__label">Page break</span>
      <span className="ms-page-break__line" />
    </div>
  );
}

export function ManuscriptDivider({
  style,
  label,
  onStyleChange,
  onLabelChange,
}: {
  style: DividerStyle;
  label: string;
  onStyleChange: (style: DividerStyle) => void;
  onLabelChange: (label: string) => void;
}) {
  const glyph = dividerDisplayText(style, '');
  return (
    <div className="ms-divider-block">
      <div className="ms-divider-block__display" aria-hidden="true">
        {label.trim() ? <span className="ms-divider-block__custom">{label.trim()}</span> : <span>{glyph}</span>}
      </div>
      <div className="ms-divider-block__tools">
        <span className="ms-divider-block__tool-label">Style</span>
        {(['scene', 'line', 'ornament'] as DividerStyle[]).map((key) => (
          <button
            key={key}
            type="button"
            className={style === key ? 'is-active' : ''}
            onClick={() => onStyleChange(key)}
          >
            {key === 'scene' ? 'Scene * * *' : key === 'line' ? 'Line' : 'Ornament'}
          </button>
        ))}
        <label className="ms-divider-block__label-field">
          Optional label
          <input
            type="text"
            value={label}
            placeholder="Centered label (optional)"
            onChange={(e) => onLabelChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
