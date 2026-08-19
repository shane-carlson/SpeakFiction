import { useEffect, useState } from 'react';
import type { ManuscriptImage } from '../core/types';
import { loadMedia } from '../core/mediaStore';
import { dataUrlFromBytes } from '../core/manuscriptMedia';

export function ManuscriptImageFrame({
  image,
  onCaption,
  onAlt,
}: {
  image: ManuscriptImage;
  onCaption: (caption: string) => void;
  onAlt: (alt: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadMedia(image.mediaId).then((loaded) => {
      if (!alive) return;
      if (!loaded) {
        setMissing(true);
        setSrc(null);
        return;
      }
      setMissing(false);
      setSrc(dataUrlFromBytes(loaded.mime, loaded.bytes));
    });
    return () => {
      alive = false;
    };
  }, [image.mediaId]);

  return (
    <figure className="ms-image">
      {src ? (
        <img src={src} alt={image.alt || image.caption || 'Manuscript illustration'} />
      ) : (
        <div className="ms-image-missing">
          {missing ? 'Image missing from this device' : 'Loading image…'}
        </div>
      )}
      <input
        className="ms-image-caption"
        value={image.caption ?? ''}
        placeholder="Caption"
        aria-label="Image caption"
        spellCheck={true}
        onChange={(e) => onCaption(e.target.value)}
      />
      <input
        className="ms-image-alt"
        value={image.alt ?? ''}
        placeholder="Alt text"
        aria-label="Image alt text"
        spellCheck={true}
        onChange={(e) => onAlt(e.target.value)}
      />
    </figure>
  );
}
