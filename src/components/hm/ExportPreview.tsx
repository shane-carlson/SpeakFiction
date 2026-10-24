import type { CSSProperties } from 'react';
import { displayTitle, type ManuscriptDocument } from '../../hm/document';
import { manuscriptTypographyStyle, resolveManuscriptTypography } from '../../hm/typography';
import type { CertificationPageModel } from '../../hm/certificationPage';
import { dividerDisplayText } from '../../hm/manuscript';
import { ManuscriptPageBreak } from './ManuscriptBreaks';

export function CertificationSummaryPage({ model }: { model: CertificationPageModel }) {
  return (
    <article className="summary-page" aria-label="Certification summary">
      <header className="summary-page__head">
        <p className="eyebrow">Certification summary</p>
        <h3>SpeakFiction certification summary</h3>
        <p className="summary-page__book">{model.bookTitle}</p>
        {model.seriesLabel ? <p className="summary-page__series">{model.seriesLabel}</p> : null}
      </header>

      <p className="summary-purpose">{model.banner}</p>

      <section className="summary-page__facts" aria-label="Key certification facts">
        <dl className="summary-facts">
          <div>
            <dt>Manuscript</dt>
            <dd>{model.manuscriptTitle}</dd>
          </div>
          <div>
            <dt>Manuscript id</dt>
            <dd className="summary-mono">{model.manuscriptId}</dd>
          </div>
        </dl>
      </section>

      <section className="summary-page__rollup" aria-label="Certified versus pasted words">
        <h4>Certified versus pasted</h4>
        <div className="summary-rollup">
          <div>
            <span>Keyboard, certified</span>
            <strong>{model.totals.keyboardSealed}</strong>
          </div>
          <div>
            <span>Dictation, sealed</span>
            <strong>{model.totals.dictationSealed}</strong>
          </div>
          <div>
            <span>Pasted / uncertified</span>
            <strong>{model.totals.pastedUncertified}</strong>
          </div>
        </div>
        <ul className="summary-origin-list">
          <li>Paste {model.totals.paste}</li>
          <li>Drop {model.totals.drop}</li>
          <li>Other {model.totals.other}</li>
        </ul>
      </section>

      <section className="summary-page__stats" aria-label="Export statistics">
        <h4>Statistics</h4>
        <dl className="summary-stats">
          <div>
            <dt>Exported</dt>
            <dd>{model.exportedAtLabel}</dd>
          </div>
          <div>
            <dt>Total words</dt>
            <dd>{model.totals.totalWords}</dd>
          </div>
          <div>
            <dt>Certified words</dt>
            <dd>{model.totals.keyboardSealed + model.totals.dictationSealed}</dd>
          </div>
          <div>
            <dt>Keyboard, certified</dt>
            <dd>{model.totals.keyboardSealed}</dd>
          </div>
          <div>
            <dt>Dictation, sealed</dt>
            <dd>{model.totals.dictationSealed}</dd>
          </div>
          <div>
            <dt>Pasted / uncertified</dt>
            <dd>{model.totals.pastedUncertified}</dd>
          </div>
          <div>
            <dt>Chapters</dt>
            <dd>{model.chapters}</dd>
          </div>
          <div>
            <dt>Scenes</dt>
            <dd>{model.scenes}</dd>
          </div>
          <div>
            <dt>Sections</dt>
            <dd>{model.sections}</dd>
          </div>
          <div>
            <dt>Paragraphs</dt>
            <dd>{model.paragraphs}</dd>
          </div>
          <div>
            <dt>Certification points</dt>
            <dd>{model.certificationPoints}</dd>
          </div>
          {model.devices.length > 0 ? (
            <div>
              <dt>{model.devices.length === 1 ? 'Device' : 'Devices'}</dt>
              <dd>
                {model.devices.length === 1 ? (
                  model.devices[0]
                ) : (
                  <ul className="summary-device-list">
                    {model.devices.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Book</dt>
            <dd>{model.bookTitle}</dd>
          </div>
          {model.seriesLabel ? (
            <div>
              <dt>Series</dt>
              <dd>{model.seriesLabel}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </article>
  );
}

export function CleanManuscript({ doc }: { doc: ManuscriptDocument }) {
  if (!doc.blocks.length) {
    return <p className="export-preview-empty">The manuscript has no pages yet. The summary above is still the first page of the export.</p>;
  }
  const chapterNumbers = new Map<string, number>();
  let nextChapter = 0;
  for (const block of doc.blocks) {
    if (block.type === 'chapter') {
      nextChapter += 1;
      chapterNumbers.set(block.id, nextChapter);
    }
  }
  const typography = resolveManuscriptTypography(doc);
  return (
    <div
      className="clean-manuscript"
      style={manuscriptTypographyStyle(doc) as CSSProperties}
      data-manuscript-font={typography.font.id}
      data-manuscript-size={typography.sizePt}
    >
      <h3 className="clean-manuscript__title">{displayTitle(doc)}</h3>
      {doc.blocks.map((block) => {
        switch (block.type) {
          case 'chapter':
            return <h4 key={block.id}>{block.title.trim() || `Chapter ${chapterNumbers.get(block.id)}`}</h4>;
          case 'section':
            return <h4 key={block.id} className="clean-manuscript__section">{block.title.trim() || 'Section'}</h4>;
          case 'scene':
            return (
              <p key={block.id} className="clean-manuscript__break">
                {block.title.trim() || '* * *'}
              </p>
            );
          case 'paragraph':
            return block.text.trim() ? <p key={block.id}>{block.text}</p> : null;
          case 'blockquote':
            return block.text.trim() ? <blockquote key={block.id}>{block.text}</blockquote> : null;
          case 'pageBreak':
            return <ManuscriptPageBreak key={block.id} />;
          case 'divider':
            return (
              <p key={block.id} className="clean-manuscript__break">
                {dividerDisplayText(block.dividerStyle, block.title)}
              </p>
            );
          case 'table':
            return (
              <table key={block.id} className="clean-manuscript__table">
                <tbody>
                  {(block.tableRows ?? []).map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case 'image':
            if (!block.imageSrc && !block.imageAlt?.trim() && !block.imageCaption?.trim()) return null;
            return block.imageSrc ? (
              <figure key={block.id} className="clean-manuscript__figure">
                <img src={block.imageSrc} alt={block.imageAlt?.trim() || block.imageCaption?.trim() || ''} />
                {block.imageCaption?.trim() ? <figcaption>{block.imageCaption.trim()}</figcaption> : null}
              </figure>
            ) : (
              <p key={block.id}>[Image: {block.imageAlt?.trim() || block.imageCaption?.trim()}]</p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export function ExportPreview({ model, doc }: { model: CertificationPageModel; doc: ManuscriptDocument }) {
  return (
    <section className="export-preview" aria-label="Export preview">
      <div className="export-preview__head">
        <h3>Export preview</h3>
        <p>The certification summary page, then a page break, then the manuscript with no certification highlights.</p>
      </div>
      <div className="export-sheet">
        <CertificationSummaryPage model={model} />
      </div>
      <ManuscriptPageBreak />
      <div className="export-sheet export-sheet--manuscript">
        <CleanManuscript doc={doc} />
      </div>
    </section>
  );
}
