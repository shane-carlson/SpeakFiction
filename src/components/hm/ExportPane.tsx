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
}: {
  doc: ManuscriptDocument;
  bookTitle?: string;
  seriesLabel?: string | null;
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
      <div className="export-pane__head">
        <div>
          <h2>Export</h2>
          <p>Guided hand-off to your writing tool. Speak Fiction-style structure becomes chapters and scenes on import.</p>
        </div>
        <div className="book-pill">
          <span aria-hidden="true">📖</span>
          <b>{title}</b>
          <span className="book-pill__meta">
            · {stats.chapters} ch · {stats.words} words · {doc.points.length} seal{doc.points.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <p className="export-cert-note">
        Every download starts with the one-page <strong>certification summary</strong> from the manuscript{' '}
        <strong>Export preview</strong> — key facts, keyboard-certified words versus pasted or uncertified words, and the
        manuscript counts — then a page break. The manuscript follows with no certification highlights, and pasted text
        stays uncertified.
      </p>

      <div className="stepper" aria-label="Export steps">
        <div className="step is-active"><span className="num">1</span> Choose destination</div>
        <div className="step is-active"><span className="num">2</span> Review steps</div>
        <div className="step is-active"><span className="num">3</span> Export &amp; follow along</div>
      </div>

      <div className="target-grid">
        {TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`target-card${t.id === target.id ? ' is-selected' : ''}`}
            onClick={() => setTarget(t)}
            aria-pressed={t.id === target.id}
          >
            <span className="target-card__ico" aria-hidden="true">{t.icon}</span>
            <h3>{t.name}</h3>
            <p>{t.blurb}</p>
          </button>
        ))}
      </div>

      <div className="export-detail card">
        <h3>Guided steps — {target.name}</h3>
        <p className="sub">Follow along after exporting ({EXPORT_FORMAT_LABELS[target.format]}).</p>
        <ol className="instruction-list">
          {target.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <button type="button" className="primary export-download" disabled={exporting} onClick={() => void runExport()}>
          {exporting ? 'Exporting…' : `Download for ${target.name}`}
        </button>
      </div>
    </div>
  );
}
