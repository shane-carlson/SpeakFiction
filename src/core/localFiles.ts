export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SaveResult {
  ok: boolean;
  path?: string;
}

function toBlob(content: string | Uint8Array | Blob, mime: string): Blob {
  if (content instanceof Blob) return content;
  if (typeof content === 'string') return new Blob([content], { type: mime });
  const copy = new ArrayBuffer(content.byteLength);
  new Uint8Array(copy).set(content);
  return new Blob([copy], { type: mime });
}

function downloadBlob(filename: string, content: string | Uint8Array | Blob, mime: string): void {
  const blob = toBlob(content, mime);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pickFileInBrowser(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then(resolve, () => resolve(null));
    });
    input.click();
  });
}

/** Save UTF-8 text via Electron dialog, or a browser download in Vite-only. */
export async function saveTextFile(opts: {
  defaultPath: string;
  content: string;
  filters: FileFilter[];
  mime?: string;
}): Promise<SaveResult> {
  const files = window.speakfiction?.files;
  if (files) return files.saveText(opts);
  downloadBlob(opts.defaultPath, opts.content, opts.mime ?? 'application/octet-stream');
  return { ok: true };
}

/** Save binary via Electron dialog, or a browser download in Vite-only. */
export async function saveBytesFile(opts: {
  defaultPath: string;
  bytes: Uint8Array;
  filters: FileFilter[];
  mime?: string;
}): Promise<SaveResult> {
  const files = window.speakfiction?.files;
  if (files) return files.saveBytes({ ...opts, bytes: Array.from(opts.bytes) });
  downloadBlob(opts.defaultPath, opts.bytes, opts.mime ?? 'application/octet-stream');
  return { ok: true };
}

/** Open a text file via Electron dialog, or a hidden file input in Vite-only. */
export async function openTextFile(opts?: { filters?: FileFilter[] }): Promise<string | null> {
  const files = window.speakfiction?.files;
  if (files) {
    const res = await files.openText(opts);
    return res.ok && typeof res.content === 'string' ? res.content : null;
  }
  const accept = (opts?.filters ?? [])
    .flatMap((f) => f.extensions.map((ext) => `.${ext}`))
    .join(',');
  return pickFileInBrowser(accept || '.json');
}
