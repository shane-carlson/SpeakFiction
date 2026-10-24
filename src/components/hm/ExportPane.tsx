import { useMemo, useState, type ReactNode } from 'react';
import { type CertificationPageIdentity } from '../../hm/certificationPage';
import { displayTitle, manuscriptStats, type ManuscriptDocument } from '../../hm/document';
import {
  EXPORT_FORMAT_LABELS,
  exportFilename,
  exportManuscriptBlob,
  SCRIVENER_SPLIT_SEPARATOR,
  type ExportFormat,
} from '../../hm/exportManuscript';

interface TargetInfo {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  format: ExportFormat;
  steps: ReactNode[];
}

const TARGETS: TargetInfo[] = [
  {
    id: 'word',
    name: 'Microsoft Word',
    icon: '📄',
    blurb: 'A styled .docx with chapter headings, then your manuscript body.',
    format: 'docx',
    steps: [
      'Download the .docx below.',
      'Open it in Word. The first page is the SpeakFiction certification summary; a page break starts the manuscript.',
      'Use View → Navigation Pane to jump between chapters.',
    ],
  },
  {
    id: 'scrivener',
    name: 'Scrivener',
    icon: '📝',
    blurb: 'Import and Split on # — one binder document per chapter.',
    format: 'scrivener-rtf',
    steps: [
      'Download the Scrivener import RTF below.',
      'In Scrivener 3 (Mac): File → Import → Import and Split…',
      'Choose the exported .rtf.',
      <>
        Select <b>Split into sections by finding separators in the text</b>. Set the separator to exactly{' '}
        <span className="kbd">{SCRIVENER_SPLIT_SEPARATOR}</span> (a hash on its own line).
      </>,
      'A page break follows the certification summary. The manuscript starts on the next page.',
    ],
  },
  {
    id: 'libreoffice',
    name: 'LibreOffice / OpenOffice',
    icon: '📗',
    blurb: 'Native .odt with headings; certification summary leads the document.',
    format: 'odt',
    steps: [
      'Download the .odt below.',
      'Open it in LibreOffice Writer. The certification summary is its own page, then the manuscript.',
      'Use View → Navigator (F5) to move between chapters.',
    ],
  },
  {
    id: 'googledocs',
    name: 'Google Docs',
    icon: '🗂️',
    blurb: 'Upload the .docx; Docs converts headings and keeps the certification summary.',
    format: 'docx',
    steps: [
      'Download the .docx below.',
      'In Google Drive: New → File upload, then select the .docx.',
      'Right-click the file → Open with → Google Docs.',
      'The certification summary is the first page. Headings map to the document outline (View → Show outline).',
    ],
  },
  {
    id: 'rtf',
    name: 'Rich Text',
    icon: '📋',
    blurb: 'Universal .rtf for Pages, WordPad, and other editors.',
    format: 'rtf',
    steps: ['Download the .rtf below.', 'Open in any rich-text editor. A page break follows the certification summary.'],
  },
  {
    id: 'markdown',
    name: 'Markdown',
    icon: '⬇️',
    blurb: 'Portable Markdown with # headings.',
    format: 'markdown',
    steps: ['Download the .md below.', 'A page-break marker follows the certification summary, then the manuscript.'],
  },
  {
    id: 'plaintext',
    name: 'Plain text',
    icon: '🧾',
    blurb: 'Clean .txt for maximum compatibility.',
    format: 'plain',
    steps: ['Download the .txt below.', 'A form feed follows the certification summary so the manuscript starts on the next page.'],
  },
  {
    id: 'pdf',
    name: 'PDF',
    icon: '📕',
    blurb: 'Printable PDF with certification summary, then the manuscript.',
    format: 'pdf',
    steps: ['Download the .pdf below.', 'Share or print. The summary is page one; the manuscript starts on the next page.'],
  },
];

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportPane({
  doc,
  bookTitle,
  seriesLabel = null,
  embedded = false,
}: {
  doc: ManuscriptDocument;
  bookTitle?: string;
  seriesLabel?: string | null;
  embedded?: boolean;
}) {
  const [target, setTarget] = useState<TargetInfo>(TARGETS[0]);
  const [exporting, setExporting] = useState(false);
  const stats = useMemo(() => manuscriptStats(doc.blocks), [doc.blocks]);
  const title = displayTitle(doc);
  const identity = useMemo<CertificationPageIdentity>(
    () => ({ bookTitle: bookTitle || title, seriesLabel }),
    [bookTitle, seriesLabel, title],
  );
  const runExport = async () => {
    setExporting(true);
    try {
      const blob = await exportManuscriptBlob(doc, target.format, new Date().toISOString(), identity);
      downloadBlob(exportFilename(title, target.format), blob);
    } catch (error) {
      console.error(error);
      window.alert('Export failed. Try again or pick another destination.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-pane">
      {!embedded && (
        <div className="page-head">
          <div>
            <h2>Export</h2>
            <p>Guided hand-off to your writing tool. Spoken structure becomes chapters and scenes on import.</p>
          </div>
          <div className="book-pill">
            <span aria-hidden="true">📖</span>
            <b>{title}</b>
            <span>
              · {stats.chapters} ch · {stats.words} words · {doc.points.length} seal
              {doc.points.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}

      <div className="note-banner" style={{ marginBottom: 16 }}>
        <span className="ico">✅</span>
        <div>
          Every download starts with the one-page <b>certification summary</b> from the manuscript
          Export preview — key facts, keyboard-certified words versus pasted or uncertified words,
          and the manuscript counts — then a page break. The manuscript follows with no
          certification highlights, and pasted text stays uncertified.
        </div>
      </div>

      <div className="stepper">
        <div className="step active">
          <span className="num">1</span> Choose destination
        </div>
        <div className="step active">
          <span className="num">2</span> Review steps
        </div>
        <div className="step active">
          <span className="num">3</span> Export &amp; follow along
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

      <div className="card">
        <h3>Guided steps — {target.name}</h3>
        <p className="sub">Follow along after exporting ({EXPORT_FORMAT_LABELS[target.format]}).</p>
        <ul className="instruction">
          {target.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
        <div style={{ marginTop: 18 }}>
          <button type="button" className="btn primary big" disabled={exporting} onClick={() => void runExport()}>
            {exporting ? 'Exporting…' : `⬇ Export for ${target.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
