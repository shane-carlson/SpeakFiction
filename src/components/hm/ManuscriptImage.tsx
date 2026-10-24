import { useRef, useState } from 'react';
import { collectSpellSuggestions, wordAroundOffset } from '../../hm/contextMenu';
import { FieldContextMenu, type ContextMenuState, type MenuAnchor } from './FieldContextMenu';

export function ManuscriptImage({
  src,
  alt,
  caption,
  onPickFile,
  onAltChange,
  onCaptionChange,
  onClear,
}: {
  src: string | undefined;
  alt: string | undefined;
  caption: string | undefined;
  onPickFile: (file: File) => void;
  onAltChange: (alt: string) => void;
  onCaptionChange: (caption: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="ms-image-wrap">
      {src ? (
        <figure className="ms-image-figure">
          <img src={src} alt={alt || caption || 'Manuscript image'} className="ms-image" />
          <figcaption>
            <SpellField
              label="Caption"
              ariaLabel="Image caption"
              className="ms-image-caption"
              value={caption ?? ''}
              placeholder="Caption"
              onChange={onCaptionChange}
            />
            <SpellField
              label="Alt text"
              ariaLabel="Image alt text"
              className="ms-image-alt"
              value={alt ?? ''}
              placeholder="Describe the image for export"
              onChange={onAltChange}
            />
            <button type="button" onClick={onClear}>Remove image</button>
          </figcaption>
        </figure>
      ) : (
        <label className="ms-image-drop">
          <input
            type="file"
            accept="image/*"
            className="ms-image-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPickFile(file);
              event.target.value = '';
            }}
          />
          <span>Choose an image or drop a file here when pasting from the toolbar.</span>
        </label>
      )}
      <p className="ms-table-note">Images are not keyboard-certified.</p>
    </div>
  );
}

function SpellField({
  label,
  ariaLabel,
  className,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  className: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<MenuAnchor | null>(null);
  const replaceRef = useRef<{ start: number; end: number } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  return (
    <label className="ms-image-alt-label">
      {label}
      <input
        ref={inputRef}
        type="text"
        className={className}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        spellCheck
        onChange={(event) => onChange(event.target.value)}
        onContextMenu={(event) => {
          const input = inputRef.current;
          if (!input) return;
          event.preventDefault();
          const at = input.selectionStart ?? value.length;
          const word = wordAroundOffset(value, at);
          const suggestions = word
            ? collectSpellSuggestions({
                word: word.word,
                event: event.nativeEvent,
                platform: window.speakfiction?.device?.spellSuggestions ?? window.humanuscript?.getSpellSuggestions,
              })
            : [];
          replaceRef.current = word ? { start: word.start, end: word.end } : null;
          anchorRef.current = null;
          setMenu({
            x: event.clientX,
            y: event.clientY,
            hasSelection: (input.selectionEnd ?? at) > at,
            suggestions,
            misspelledWord: word ? word.word : null,
          });
        }}
      />
      <FieldContextMenu
        variant="spell"
        state={menu}
        anchorRef={anchorRef}
        onClose={() => {
          replaceRef.current = null;
          setMenu(null);
        }}
        onCut={() => undefined}
        onCopy={() => undefined}
        onPaste={() => undefined}
        onSelectAll={() => inputRef.current?.select()}
        onInsertTable={() => undefined}
        onInsertImage={() => undefined}
        onInsertPageBreak={() => undefined}
        onInsertDivider={() => undefined}
        onInsertBlockquote={() => undefined}
        onReplaceWord={(replacement) => {
          const range = replaceRef.current;
          if (!range) return;
          onChange(value.slice(0, range.start) + replacement + value.slice(range.end));
        }}
      />
    </label>
  );
}
