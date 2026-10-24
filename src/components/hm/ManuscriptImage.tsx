export function ManuscriptImage({
  src,
  alt,
  onPickFile,
  onAltChange,
  onClear,
}: {
  src: string | undefined;
  alt: string | undefined;
  onPickFile: (file: File) => void;
  onAltChange: (alt: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="ms-image-wrap">
      {src ? (
        <figure className="ms-image-figure">
          <img src={src} alt={alt || 'Manuscript image'} className="ms-image" />
          <figcaption>
            <label className="ms-image-alt-label">
              Alt text
              <input
                type="text"
                value={alt ?? ''}
                onChange={(e) => onAltChange(e.target.value)}
                placeholder="Describe the image for export"
              />
            </label>
            <button type="button" onClick={onClear}>Remove image</button>
          </figcaption>
        </figure>
      ) : (
        <label className="ms-image-drop">
          <input
            type="file"
            accept="image/*"
            className="ms-image-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              e.target.value = '';
            }}
          />
          <span>Choose an image or drop a file here when pasting from the toolbar.</span>
        </label>
      )}
      <p className="ms-table-note">Images are not keyboard-certified.</p>
    </div>
  );
}
