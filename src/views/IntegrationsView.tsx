import { useMemo, useState } from 'react';
import type { Book, IntegrationTarget } from '../core/types';
import { getGenre } from '../core/genres';
import { toMarkdown, toPlainText, toRtf, toScrivener, type ExportContext } from '../core/export';
import { docxToBlob } from '../core/exportDocx';
import { slugify } from '../core/util';
import { manuscriptStats } from '../core/manuscript';

interface TargetInfo {
  id: IntegrationTarget;
  name: string;
  icon: string;
  blurb: string;
  steps: string[];
  format: 'rtf' | 'docx' | 'md' | 'txt';
}

const TARGETS: TargetInfo[] = [
  {
    id: 'scrivener',
    name: 'Scrivener',
    icon: '📝',
    blurb: 'Import as RTF and split into the binder by chapter and scene.',
    format: 'rtf',
    steps: [
      'Download the SpeakFiction RTF below.',
      'In Scrivener: File → Import → Files… and choose the .rtf.',
      'Select the imported document, then Documents → Split → at Selection to break out chapters.',
      'Scene breaks are centered so they align with your section separators.',
    ],
  },
  {
    id: 'word',
    name: 'Microsoft Word',
    icon: '📄',
    blurb: 'A styled .docx with Heading 1 chapters and page breaks.',
    format: 'docx',
    steps: [
      'Download the .docx below.',
      'Open it in Word — chapters use the built-in Heading 1 style.',
      'Use View → Navigation Pane to jump between chapters and scenes.',
    ],
  },
  {
    id: 'googledocs',
    name: 'Google Docs',
    icon: '🗂️',
    blurb: 'Upload the .docx; Docs converts headings automatically.',
    format: 'docx',
    steps: [
      'Download the .docx below.',
      'In Google Drive: New → File upload, then select the .docx.',
      'Right-click the file → Open with → Google Docs.',
      'Headings map to the document outline (View → Show outline).',
    ],
  },
  {
    id: 'markdown',
    name: 'Markdown',
    icon: '⬇️',
    blurb: 'Portable Markdown with # headings and scene glyphs.',
    format: 'md',
    steps: ['Download the .md below.', 'Use it with Obsidian, Ulysses, iA Writer, or any editor.'],
  },
  {
    id: 'plaintext',
    name: 'Plain text',
    icon: '🧾',
    blurb: 'Clean .txt for maximum compatibility.',
    format: 'txt',
    steps: ['Download the .txt below.', 'Paste anywhere — email, forums, or a bare editor.'],
  },
];

function download(filename: string, content: BlobPart, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function IntegrationsView({ book }: { book: Book }) {
  const [target, setTarget] = useState<TargetInfo>(TARGETS[0]);
  const genre = getGenre(book.genreId);
  const ctx: ExportContext = useMemo(() => ({ title: book.title, genre }), [book.title, genre]);
  const stats = useMemo(() => manuscriptStats(book.manuscript), [book.manuscript]);
  const scrivener = useMemo(() => toScrivener(book.manuscript, ctx), [book.manuscript, ctx]);

  const base = slugify(book.title);

  const handleExport = async () => {
    switch (target.format) {
      case 'rtf':
        download(`${base}.rtf`, toRtf(book.manuscript, ctx), 'application/rtf');
        break;
      case 'md':
        download(`${base}.md`, toMarkdown(book.manuscript, ctx), 'text/markdown');
        break;
      case 'txt':
        download(`${base}.txt`, toPlainText(book.manuscript, ctx), 'text/plain');
        break;
      case 'docx':
        download(
          `${base}.docx`,
          await docxToBlob(book.manuscript, ctx),
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        break;
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Integrations</h2>
          <p>
            Guided, one-click hand-off to your writing tool. Spoken cues become real chapters, scenes,
            and sections on import.
          </p>
        </div>
        <div className="book-pill">
          <span>📖</span>
          <b>{book.title}</b>
          <span>
            · {stats.chapters} ch · {stats.scenes} scenes · {stats.words} words
          </span>
        </div>
      </div>

      <div className="stepper">
        <div className="step active">
          <span className="num">1</span> Choose destination
        </div>
        <div className="step active">
          <span className="num">2</span> Review structure
        </div>
        <div className="step active">
          <span className="num">3</span> Export & follow steps
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        {TARGETS.map((t) => (
          <div
            key={t.id}
            className={`card target-card ${t.id === target.id ? 'selected' : ''}`}
            onClick={() => setTarget(t)}
          >
            <div className="ico">{t.icon}</div>
            <h3>{t.name}</h3>
            <p className="sub" style={{ margin: 0 }}>
              {t.blurb}
            </p>
          </div>
        ))}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Guided steps — {target.name}</h3>
          <p className="sub">Follow along after exporting.</p>
          <ul className="instruction">
            {target.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <div style={{ marginTop: 18 }}>
            <button className="btn primary big" onClick={handleExport}>
              ⬇ Export for {target.name}
            </button>
          </div>

          <div className="note-banner" style={{ marginTop: 18 }}>
            <span className="ico">🖥️</span>
            <div>
              <b>Native macOS hand-off</b> (Scrivener / Word live insertion via the Accessibility
              API) ships with the packaged desktop build. This preview provides the guided
              file-based path, which works on every platform.
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Structure preview</h3>
          <p className="sub">What SpeakFiction will create in {target.name}.</p>
          {scrivener.outline.length === 0 ? (
            <div className="empty">Dictate some chapters and scenes first.</div>
          ) : (
            <div>
              {scrivener.outline.map((o, i) => (
                <div
                  key={i}
                  className="list-row"
                  style={{ marginBottom: 6, paddingLeft: o.level === 2 ? 28 : 12 }}
                >
                  <span className={`badge ${o.kind}`}>{o.kind}</span>
                  <div className="grow">
                    <span className={o.level === 1 ? 'name' : ''}>{o.title}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
