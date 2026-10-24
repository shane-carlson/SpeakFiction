import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  certificationExport,
  chapterOrder,
  displayTitle,
  dragPreviewLabel,
  editField,
  insertStructure,
  movePassage,
  replaceAllManuscriptMatches,
  replaceManuscriptMatch,
  nudgeBlock,
  passageState,
  removeBlock,
  reorderBlocks,
  splitParagraph,
  mergeParagraphBackward,
  toggleFormat,
  updateDividerBlock,
  updateImageBlock,
  updateParagraphMeta,
  updateTableRows,
  type ManuscriptDocument,
} from '../../hm/document';
import { formatMixLabel, provenanceMix } from '../../hm/provenanceMix';
import { findMatches, matchIndexAtOrAfter, nearestValidDropIndex, validDropIndices } from '../../hm/manuscript';
import { isProseBlock, type BlockType, type InlineMarkKind } from '../../hm/types';
import { createIdFactory } from '../../hm/uid';
import { formatTypingDeviceLabel, getTypingDeviceLabel, shortPlatformLabel } from '../../hm/deviceName';
import { buildCertificationPageModel } from '../../hm/certificationPage';
import { openPassageCards, scrollDelta } from '../../hm/passageCard';
import {
  loadCertificationCollapsed,
  loadEditorView,
  saveCertificationCollapsed,
  saveEditorView,
  type EditorViewMode,
} from '../../hm/editorPrefs';
import { CertificationMark } from './CertificationMark';
import { ManuscriptDivider, ManuscriptPageBreak } from './ManuscriptBreaks';
import { ManuscriptImage } from './ManuscriptImage';
import { ManuscriptTable } from './ManuscriptTable';
import {
  IconBlockQuote,
  IconBold,
  IconBulletList,
  IconCertificationView,
  IconChapter,
  IconExportPreview,
  IconFindNext,
  IconFindPrevious,
  IconImage,
  IconItalic,
  IconManuscriptView,
  IconNumberList,
  IconPageBreak,
  IconParagraph,
  IconRedo,
  IconReplace,
  IconReplaceAll,
  IconScene,
  IconSceneBreak,
  IconSection,
  IconTable,
  IconUnderline,
  IconUndo,
  ToolbarIconButton,
} from './ManuscriptToolbarIcons';
import { ProvenanceField, type FieldCommit } from './ProvenanceField';
import { ExportPreview } from './ExportPreview';
import {
  MANUSCRIPT_FONTS,
  MANUSCRIPT_FONT_SIZES,
  manuscriptTypographyStyle,
  resolveManuscriptTypography,
  setManuscriptTypography,
} from '../../hm/typography';

const BLOCK_MIME = 'application/x-humanuscript-block';

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base || 'untitled-manuscript';
}

export function Editor({
  doc,
  onChange,
  focusMode = false,
  onFocusModeChange,
  bookTitle,
  seriesLabel = null,
  onDictationTarget,
}: {
  doc: ManuscriptDocument;
  onChange: (doc: ManuscriptDocument) => void;
  focusMode?: boolean;
  onFocusModeChange?: (focus: boolean) => void;
  bookTitle?: string;
  seriesLabel?: string | null;
  /** SpeakFiction dictation insert point. Gaps set an index; a caret sets a split. */
  onDictationTarget?: (target: { atIndex?: number; blockId?: string; splitOffset?: number }) => void;
}) {
  const ids = useRef(createIdFactory('hm'));
  const docRef = useRef(doc);
  const chain = useRef(Promise.resolve());
  const [undo, setUndo] = useState<ManuscriptDocument[]>([]);
  const [redo, setRedo] = useState<ManuscriptDocument[]>([]);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [replaceNote, setReplaceNote] = useState('');
  const [hit, setHit] = useState(0);
  const [selection, setSelection] = useState<{ blockId: string; start: number; end: number } | null>(null);
  const [renderToken, setRenderToken] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>(() => loadEditorView());
  const [certCollapsed, setCertCollapsed] = useState(() => loadCertificationCollapsed());
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [linkedCardId, setLinkedCardId] = useState<string | null>(null);
  const [liveDevice, setLiveDevice] = useState<string | null>(() => shortPlatformLabel());
  const pointListRef = useRef<HTMLOListElement>(null);
  const textDrag = useRef<{ blockId: string; start: number; end: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveEditorView(viewMode);
  }, [viewMode]);

  useEffect(() => {
    saveCertificationCollapsed(certCollapsed);
  }, [certCollapsed]);

  useEffect(() => {
    let cancel = false;
    void getTypingDeviceLabel().then((label) => {
      if (!cancel) setLiveDevice(label);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  }, [undo, redo]);

  const replace = useCallback((next: ManuscriptDocument) => {
    docRef.current = next;
    setRenderToken((token) => token + 1);
    onChange(next);
  }, [onChange]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || event.altKey || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      if (event.shiftKey) {
        const next = redoRef.current[0];
        if (!next) return;
        setRedo(redoRef.current.slice(1));
        setUndo([...undoRef.current, docRef.current]);
        replace(next);
        return;
      }
      const previous = undoRef.current[undoRef.current.length - 1];
      if (!previous) return;
      setUndo(undoRef.current.slice(0, -1));
      setRedo([docRef.current, ...redoRef.current]);
      replace(previous);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [replace]);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      onFocusModeChange?.(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusMode, onFocusModeChange]);

  const commit = (
    recipe: (current: ManuscriptDocument) => Promise<ManuscriptDocument> | ManuscriptDocument,
    options?: { external?: boolean },
  ) => {
    const snapshot = docRef.current;
    chain.current = chain.current.then(async () => {
      try {
        const next = await recipe(docRef.current);
        if (next === docRef.current) return;
        docRef.current = next;
        setUndo((stack) => [...stack, snapshot].slice(-40));
        setRedo([]);
        if (options?.external) setRenderToken((token) => token + 1);
        onChange(next);
      } catch (error) {
        console.error(error);
      }
    });
  };

  const applyCommit = (blockId: string, field: 'title' | 'text', change: FieldCommit) => {
    commit((current) =>
      editField({
        doc: current,
        blockId,
        field,
        start: change.start,
        end: change.end,
        insert: change.insert,
        origin: change.origin,
        pasteHint: change.pasteHint,
        event: change.event,
        now: new Date().toISOString(),
        newId: ids.current,
      }),
    );
  };

  const matches = useMemo(() => findMatches(doc.blocks, query), [doc.blocks, query]);
  const activeIndex = matches.length ? ((hit % matches.length) + matches.length) % matches.length : 0;
  const activeHit = matches.length ? matches[activeIndex]! : null;
  const numbers = useMemo(() => new Map(chapterOrder(doc.blocks).map((c) => [c.id, c.number])), [doc.blocks]);
  const name = slug(displayTitle(doc));

  useEffect(() => {
    if (!activeHit) return;
    document.getElementById(`block-${activeHit.blockId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeHit]);

  const stepMatch = (delta: number) => {
    if (!matches.length) return;
    setHit((n) => {
      const current = ((n % matches.length) + matches.length) % matches.length;
      return (current + delta + matches.length) % matches.length;
    });
  };

  const replaceCurrent = () => {
    if (!matches.length || !query.trim()) return;
    const current = matches[activeIndex]!;
    const queryNow = query;
    const replacementNow = replacement;
    commit(async (currentDoc) => {
      const live = findMatches(currentDoc.blocks, queryNow);
      const match = live.find(
        (item) =>
          item.blockId === current.blockId &&
          item.field === current.field &&
          item.start === current.start &&
          item.end === current.end,
      );
      if (!match) return currentDoc;
      const next = await replaceManuscriptMatch({
        doc: currentDoc,
        match,
        replacement: replacementNow,
        now: new Date().toISOString(),
        newId: ids.current,
      });
      if (next === currentDoc) return currentDoc;
      const nextMatches = findMatches(next.blocks, queryNow);
      const idx = matchIndexAtOrAfter(next.blocks, nextMatches, {
        blockId: match.blockId,
        field: match.field,
        at: match.start + replacementNow.length,
      });
      setHit(idx >= 0 ? idx : 0);
      setReplaceNote('Replaced 1');
      return next;
    }, { external: true });
  };

  const replaceEvery = () => {
    if (!query.trim()) return;
    const queryNow = query;
    const replacementNow = replacement;
    commit(async (currentDoc) => {
      const result = await replaceAllManuscriptMatches({
        doc: currentDoc,
        query: queryNow,
        replacement: replacementNow,
        now: new Date().toISOString(),
        newId: ids.current,
      });
      if (result.doc === currentDoc) return currentDoc;
      setHit(0);
      setReplaceNote(result.count === 1 ? 'Replaced 1' : `Replaced ${result.count}`);
      return result.doc;
    }, { external: true });
  };

  const onFormat = (kind: InlineMarkKind) => {
    if (!selection) return;
    commit((current) => toggleFormat(current, selection.blockId, selection, kind));
  };

  const insertAfter = (afterBlockId: string, kind: BlockType) => {
    commit((current) => {
      const index = current.blocks.findIndex((b) => b.id === afterBlockId);
      if (index < 0) return current;
      return insertStructure(current, kind, index + 1, ids.current());
    });
  };

  const insertNear = (kind: BlockType) => {
    commit((current) => {
      const index = selection
        ? current.blocks.findIndex((b) => b.id === selection.blockId)
        : current.blocks.length - 1;
      const at = index >= 0 ? index + 1 : 0;
      return insertStructure(current, kind, at, ids.current());
    });
  };

  const dictationTargetRef = useRef(onDictationTarget);
  dictationTargetRef.current = onDictationTarget;
  useEffect(() => {
    const report = dictationTargetRef.current;
    if (!report || !selection) return;
    const atIndex = doc.blocks.findIndex((block) => block.id === selection.blockId);
    if (atIndex < 0) return;
    const block = doc.blocks[atIndex];
    if (block && (block.type === 'paragraph' || block.type === 'blockquote')) {
      report({ blockId: block.id, splitOffset: selection.start });
    }
  }, [selection, doc.blocks]);

  const showHighlights = viewMode === 'highlights';
  const showPreview = viewMode === 'preview';
  const typography = resolveManuscriptTypography(doc);
  const manuscriptStyle = manuscriptTypographyStyle(doc) as CSSProperties;
  const showReplace = replaceOpen && !showPreview;
  const openCards = useMemo(
    () => (showHighlights ? openPassageCards(doc) : []),
    [doc, showHighlights],
  );
  if (!showHighlights && linkedCardId !== null) setLinkedCardId(null);

  const linkCertificationCard = useCallback((cardId: string | null) => {
    if (cardId) setLinkedCardId(cardId);
  }, []);

  useLayoutEffect(() => {
    if (!showHighlights || certCollapsed || !linkedCardId) return;
    const card = pointListRef.current?.querySelector<HTMLElement>(
      `[data-card-id="${CSS.escape(linkedCardId)}"]`,
    );
    if (card) scrollCardIntoCertificationPane(card);
  }, [showHighlights, certCollapsed, linkedCardId, doc.points.length, openCards.length]);
  const [previewExportedAt, setPreviewExportedAt] = useState(() => new Date().toISOString());
  const previewModel = useMemo(
    () => buildCertificationPageModel(doc, previewExportedAt, {
      bookTitle: bookTitle || displayTitle(doc),
      seriesLabel,
    }, liveDevice),
    [doc, previewExportedAt, bookTitle, seriesLabel, liveDevice],
  );
  const openPreview = () => {
    setPreviewExportedAt(new Date().toISOString());
    setViewMode('preview');
  };

  return (
    <div
      className={`editor-layout${certCollapsed ? ' is-cert-collapsed' : ''}`}
    >
      <main className={`canvas manuscript-surface${showPreview ? ' is-preview' : ''}`}>
        <div className={`canvas-head${showReplace ? ' is-replace-open' : ''}`}>
        <div className="toolbar" role="toolbar" aria-label="Manuscript tools">
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-structure">Structure</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-structure">
              <ToolbarIconButton label="Insert chapter" onClick={() => commit((current) => insertStructure(current, 'chapter', current.blocks.length, ids.current()))}>
                <IconChapter />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert scene" onClick={() => commit((current) => insertStructure(current, 'scene', current.blocks.length, ids.current()))}>
                <IconScene />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert section" onClick={() => commit((current) => insertStructure(current, 'section', current.blocks.length, ids.current()))}>
                <IconSection />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert paragraph" onClick={() => commit((current) => insertStructure(current, 'paragraph', current.blocks.length, ids.current()))}>
                <IconParagraph />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert table" onClick={() => commit((current) => insertStructure(current, 'table', current.blocks.length, ids.current()))}>
                <IconTable />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert image" onClick={() => commit((current) => insertStructure(current, 'image', current.blocks.length, ids.current()))}>
                <IconImage />
              </ToolbarIconButton>
            </div>
          </div>
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-breaks">Breaks</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-breaks">
              <ToolbarIconButton label="Insert page break" onClick={() => insertNear('pageBreak')}>
                <IconPageBreak />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert scene break" onClick={() => insertNear('divider')}>
                <IconSceneBreak />
              </ToolbarIconButton>
            </div>
          </div>
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-formatting">Formatting</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-formatting">
              <ToolbarIconButton label="Bold" onClick={() => onFormat('bold')}>
                <IconBold />
              </ToolbarIconButton>
              <ToolbarIconButton label="Italic" onClick={() => onFormat('italic')}>
                <IconItalic />
              </ToolbarIconButton>
              <ToolbarIconButton label="Underline" onClick={() => onFormat('underline')}>
                <IconUnderline />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert block quote" onClick={() => insertNear('blockquote')}>
                <IconBlockQuote />
              </ToolbarIconButton>
              <label className="toolbar-font toolbar-font--family" data-tooltip="Manuscript font">
                <select
                  aria-label="Manuscript font"
                  value={typography.font.id}
                  onChange={(event) => {
                    const fontFamily = event.target.value;
                    commit((current) => setManuscriptTypography(current, { fontFamily }));
                  }}
                >
                  {MANUSCRIPT_FONTS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toolbar-font toolbar-font--size" data-tooltip="Manuscript font size">
                <select
                  aria-label="Manuscript font size"
                  value={String(typography.sizePt)}
                  onChange={(event) => {
                    const fontSize = Number(event.target.value);
                    commit((current) => setManuscriptTypography(current, { fontSize }));
                  }}
                >
                  {MANUSCRIPT_FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} pt
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-lists">Lists</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-lists">
                <ToolbarIconButton
                  label="Turn this paragraph into a bullet list"
                  disabled={!selection}
                onClick={() => {
                  if (!selection) return;
                  commit((c) => updateParagraphMeta(c, selection.blockId, { listStyle: 'bullet' }));
                }}
              >
                <IconBulletList />
              </ToolbarIconButton>
                <ToolbarIconButton
                  label="Turn this paragraph into a numbered list"
                  disabled={!selection}
                onClick={() => {
                  if (!selection) return;
                  commit((c) => updateParagraphMeta(c, selection.blockId, { listStyle: 'number' }));
                }}
              >
                <IconNumberList />
              </ToolbarIconButton>
            </div>
          </div>
          <div className="toolbar-history-find">
            <div className="toolbar-group">
              <span className="toolbar-group__label" id="toolbar-history">History</span>
              <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-history">
                <ToolbarIconButton
                  label="Undo last change"
                  disabled={!undo.length}
                  onClick={() => {
                    const previous = undo[undo.length - 1];
                    if (!previous) return;
                    setUndo(undo.slice(0, -1));
                    setRedo([doc, ...redo]);
                    replace(previous);
                  }}
                >
                  <IconUndo />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label="Redo last change"
                  disabled={!redo.length}
                  onClick={() => {
                    const next = redo[0];
                    if (!next) return;
                    setRedo(redo.slice(1));
                    setUndo([...undo, doc]);
                    replace(next);
                  }}
                >
                  <IconRedo />
                </ToolbarIconButton>
              </div>
            </div>
            {!showPreview && (
              <div
                className="find"
                role="search"
                aria-label={showReplace ? 'Find and replace' : 'Find'}
                onBlur={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) return;
                  setReplaceOpen(false);
                }}
              >
                <label className="toolbar-group__label" htmlFor="find">
                  {showReplace ? 'Find & replace' : 'Find'}
                </label>
                <div className="find-row">
                  <div className="find-field">
                    <input
                      id="find"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setHit(0);
                        setReplaceNote('');
                      }}
                      onFocus={() => setReplaceOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        stepMatch(e.shiftKey ? -1 : 1);
                      }}
                      placeholder="Search the manuscript"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="find-actions" role="group" aria-label="Find in the manuscript">
                      <ToolbarIconButton label="Find previous match" disabled={!matches.length} onClick={() => stepMatch(-1)}>
                        <IconFindPrevious />
                      </ToolbarIconButton>
                      <ToolbarIconButton label="Find next match" disabled={!matches.length} onClick={() => stepMatch(1)}>
                        <IconFindNext />
                      </ToolbarIconButton>
                    </div>
                    {showReplace && (
                      <div className="find-row find-row--replace">
                        <div className="find-field">
                          <input
                            id="replace"
                            aria-label="Replace"
                            value={replacement}
                            onChange={(e) => setReplacement(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              replaceCurrent();
                            }}
                            placeholder="Replacement"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <div className="find-actions" role="group" aria-label="Replace in the manuscript">
                            <ToolbarIconButton label="Replace this match" disabled={!matches.length} onClick={replaceCurrent}>
                              <IconReplace />
                            </ToolbarIconButton>
                            <ToolbarIconButton label="Replace every match" disabled={!matches.length} onClick={replaceEvery}>
                              <IconReplaceAll />
                            </ToolbarIconButton>
                          </div>
                        </div>
                        {replaceNote ? <span className="find-count">{replaceNote}</span> : null}
                      </div>
                    )}
                  </div>
                  {query.trim() ? (
                    <span className="find-count" aria-live="polite">
                      {matches.length ? activeIndex + 1 : 0} of {matches.length}
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <div className="toolbar-group toolbar-group--end">
            <span className="toolbar-group__label" id="toolbar-view">View</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-view">
              <div className="view-toggle" role="group" aria-label="Editor view">
                <ToolbarIconButton
                  label="Show the manuscript"
                  active={viewMode === 'manuscript'}
                  onClick={() => setViewMode('manuscript')}
                >
                  <IconManuscriptView />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label="Show certification highlights"
                  active={viewMode === 'highlights'}
                  onClick={() => setViewMode('highlights')}
                >
                  <IconCertificationView />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label="Preview the certified export"
                  active={viewMode === 'preview'}
                  onClick={openPreview}
                >
                  <IconExportPreview />
                </ToolbarIconButton>
              </div>
              <button
                type="button"
                className="focus-enter"
                data-tooltip={focusMode ? 'Exit full screen' : 'Write in full screen'}
                aria-label={focusMode ? 'Exit full screen' : 'Write in full screen'}
                aria-pressed={focusMode}
                onClick={() => onFocusModeChange?.(!focusMode)}
              >
                {focusMode ? 'Exit' : 'Full screen'}
              </button>
            </div>
          </div>
        </div>

        {showHighlights && (
          <ul className="legend legend--inline" aria-label="Passage origins">
            <li><i className="swatch prov-keyboard" /> Keyboard, sealed</li>
            <li><i className="swatch prov-dictation" /> Dictation, sealed</li>
            <li><i className="swatch prov-paste" /> Pasted, not sealed</li>
            <li><i className="swatch prov-drop" /> Dropped, not sealed</li>
            <li><i className="swatch prov-other" /> Other insertion, not sealed</li>
          </ul>
        )}
        </div>

        <div className="canvas-body" ref={canvasRef}>
        <div className="page-view">
        {showPreview ? (
          <ExportPreview model={previewModel} doc={doc} />
        ) : doc.blocks.length === 0 ? (
          <div className="empty">
            <h2>The page is blank.</h2>
            <p>Start a chapter and write into it. Letters from the keyboard and from dictation are sealed. A paste from a chat window stays marked, and it is never certified.</p>
            <button type="button" className="primary" onClick={() => commit((current) => insertStructure(current, 'chapter', 0, ids.current()))}>Start a chapter</button>
          </div>
        ) : (
          <div
            className={`manuscript${dragging != null ? ' is-dragging' : ''}`}
            style={manuscriptStyle}
            data-manuscript-font={typography.font.id}
            data-manuscript-size={typography.sizePt}
          >
            {doc.blocks.map((block, index) => {
              const provSpans = isProseBlock(block.type)
                ? doc.provenance[block.id]?.text ?? []
                : block.type === 'chapter' || block.type === 'scene' || block.type === 'section'
                  ? doc.provenance[block.id]?.title ?? []
                  : [];
              const provText = isProseBlock(block.type)
                ? block.text
                : block.type === 'table' ||
                    block.type === 'image' ||
                    block.type === 'pageBreak' ||
                    block.type === 'divider'
                  ? ''
                  : block.title;
              const state = passageState(provSpans, provText);
              const mixLabel =
                isProseBlock(block.type) && state === 'mixed'
                  ? formatMixLabel(provenanceMix(block.text, provSpans))
                  : null;
              const highlight = activeHit && activeHit.blockId === block.id
                ? { start: activeHit.start, end: activeHit.end }
                : null;
              return (
                <div key={block.id}>
                  <div
                    className={`ms-insert-gap${dropAt === index ? ' is-hot' : ''}`}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(BLOCK_MIME) || dragging == null) return;
                      e.preventDefault();
                      const gaps = [...canvasRef.current!.querySelectorAll<HTMLElement>('[data-insert-index]')].map((el) => ({
                        index: Number(el.dataset.insertIndex),
                        y: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2,
                      }));
                      const next = nearestValidDropIndex(e.clientY, gaps, validDropIndices(doc.blocks, dragging));
                      setDropAt(next);
                    }}
                    onDrop={(e) => {
                      if (dragging == null) return;
                      e.preventDefault();
                      const target = dropAt ?? index;
                      const from = dragging;
                      setDragging(null);
                      setDropAt(null);
                      commit((current) => reorderBlocks(current, from, target, new Date().toISOString(), ids.current()));
                    }}
                    data-insert-index={index}
                    onClick={() => onDictationTarget?.({ atIndex: index })}
                  />
                  <article id={`block-${block.id}`} className={`ms-block ms-${block.type}${dragging === index ? ' is-dragging' : ''}`}>
                    <div className="ms-gutter">
                      <span
                        className="ms-drag-handle"
                        draggable
                        role="button"
                        aria-label={`Drag ${dragPreviewLabel(block, numbers.get(block.id))}`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(BLOCK_MIME, block.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragging(index);
                        }}
                        onDragEnd={() => { setDragging(null); setDropAt(null); }}
                      >
                        <span className="ms-drag-handle__dots" />
                      </span>
                      <button type="button" aria-label="Move up" onClick={() => commit((current) => nudgeBlock(current, block.id, -1, new Date().toISOString(), ids.current()))}>↑</button>
                      <button type="button" aria-label="Move down" onClick={() => commit((current) => nudgeBlock(current, block.id, 1, new Date().toISOString(), ids.current()))}>↓</button>
                    </div>
                    {block.type === 'chapter' && <span className="kicker">Chapter {numbers.get(block.id)}</span>}
                    {block.type === 'scene' && <span className="kicker">Scene</span>}
                    {block.type === 'section' && <span className="kicker">Section</span>}
                    {block.type === 'table' && <span className="kicker">Table</span>}
                    {block.type === 'image' && <span className="kicker">Image</span>}
                    {block.type === 'pageBreak' && <span className="kicker">Page break</span>}
                    {block.type === 'divider' && <span className="kicker">Scene break</span>}
                    {block.type === 'blockquote' && <span className="kicker">Block quote</span>}
                    {block.type === 'table' ? (
                      <ManuscriptTable
                        rows={block.tableRows}
                        onCellChange={(row, col, value) => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = (b.tableRows ?? [['']]).map((r) => [...r]);
                            while (rows.length <= row) rows.push([]);
                            const line = rows[row]!;
                            while (line.length <= col) line.push('');
                            line[col] = value;
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                        onAddRow={() => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = [...(b.tableRows ?? [['', '', '']])];
                            const cols = Math.max(...rows.map((r) => r.length), 1);
                            rows.push(Array.from({ length: cols }, () => ''));
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                        onAddColumn={() => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = (b.tableRows ?? [['']]).map((r) => [...r, '']);
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                        onRemoveRow={() => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = [...(b.tableRows ?? [])];
                            if (rows.length <= 1) return current;
                            rows.pop();
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                      />
                    ) : block.type === 'image' ? (
                      <ManuscriptImage
                        src={block.imageSrc}
                        alt={block.imageAlt}
                        onPickFile={(file) => {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                            if (!dataUrl) return;
                            commit((current) => updateImageBlock(current, block.id, { imageSrc: dataUrl }));
                          };
                          reader.readAsDataURL(file);
                        }}
                        onAltChange={(alt) => commit((current) => updateImageBlock(current, block.id, { imageAlt: alt }))}
                        onClear={() => commit((current) => updateImageBlock(current, block.id, { imageSrc: '', imageAlt: '' }))}
                      />
                    ) : block.type === 'pageBreak' ? (
                      <ManuscriptPageBreak />
                    ) : block.type === 'divider' ? (
                      <ManuscriptDivider
                        style={block.dividerStyle ?? 'scene'}
                        label={block.title}
                        onStyleChange={(dividerStyle) => commit((current) => updateDividerBlock(current, block.id, { dividerStyle }))}
                        onLabelChange={(title) => commit((current) => updateDividerBlock(current, block.id, { title }))}
                      />
                    ) : (
                      <ProvenanceField
                        text={isProseBlock(block.type) ? block.text : block.title}
                        spans={isProseBlock(block.type) ? doc.provenance[block.id]?.text ?? [] : doc.provenance[block.id]?.title ?? []}
                        marks={isProseBlock(block.type) ? block.marks : []}
                        highlight={isProseBlock(block.type) || activeHit?.field === 'title' ? highlight : null}
                        placeholder={
                          block.type === 'paragraph'
                            ? 'Write the paragraph…'
                            : block.type === 'blockquote'
                              ? 'Block quote…'
                              : block.type === 'chapter'
                                ? 'Chapter title'
                                : block.type === 'scene'
                                  ? 'Scene title'
                                  : 'Section title'
                        }
                        className={
                          block.type === 'blockquote'
                            ? 'ms-para-editor ms-blockquote-editor'
                            : block.type === 'paragraph'
                              ? 'ms-para-editor'
                              : 'ms-title-editor'
                        }
                        ariaLabel={isProseBlock(block.type) ? (block.type === 'blockquote' ? 'Block quote' : 'Paragraph') : `${block.type} title`}
                        listStyle={block.type === 'paragraph' ? block.listStyle ?? null : null}
                        indentLevel={isProseBlock(block.type) ? block.indentLevel ?? 0 : 0}
                        onInsertTable={() => insertAfter(block.id, 'table')}
                        onInsertImage={() => insertAfter(block.id, 'image')}
                        onInsertPageBreak={() => insertAfter(block.id, 'pageBreak')}
                        onInsertDivider={() => insertAfter(block.id, 'divider')}
                        onInsertBlockquote={() => insertAfter(block.id, 'blockquote')}
                        onCommit={(change) => applyCommit(block.id, isProseBlock(block.type) ? 'text' : 'title', change)}
                        onSplit={(offset) => commit((current) => splitParagraph({ doc: current, blockId: block.id, offset, now: new Date().toISOString(), newId: ids.current }))}
                        onMergeBackward={() => commit((current) => isProseBlock(block.type)
                          ? mergeParagraphBackward({ doc: current, blockId: block.id, now: new Date().toISOString(), newId: ids.current })
                          : current)}
                        onSelect={(start, end) => setSelection({ blockId: block.id, start, end })}
                        onFormat={onFormat}
                        onInternalDrag={(start, end) => {
                          textDrag.current = { blockId: block.id, start, end };
                        }}
                        renderToken={renderToken}
                        showProvenance={showHighlights}
                        blockId={block.id}
                        onCertificationHover={showHighlights ? linkCertificationCard : undefined}
                        onInternalDrop={(toOffset) => {
                          const source = textDrag.current;
                          textDrag.current = null;
                          if (!source) return;
                          commit((current) =>
                            movePassage({
                              doc: current,
                              fromId: source.blockId,
                              fromStart: source.start,
                              fromEnd: source.end,
                              toId: block.id,
                              toOffset,
                              now: new Date().toISOString(),
                              newId: ids.current,
                              moveId: ids.current(),
                            }),
                          );
                        }}
                      />
                    )}
                    <div className="ms-meta">
                      {showHighlights && isProseBlock(block.type) && (
                        <>
                          <span className={`pip pip-${state}`}>
                            {state === 'empty' ? 'Empty' : state === 'certified' ? 'Certified' : state === 'mixed' ? 'Mixed' : 'Uncertified'}
                          </span>
                          {mixLabel && <span className="mix-label" title="Character mix in this paragraph">{mixLabel}</span>}
                        </>
                      )}
                      {showHighlights &&
                        !isProseBlock(block.type) &&
                        block.type !== 'table' &&
                        block.type !== 'image' &&
                        block.type !== 'pageBreak' &&
                        block.type !== 'divider' &&
                        provText.trim() && (
                        <span className={`pip pip-${state}`}>
                          {state === 'certified' ? 'Certified' : state === 'mixed' ? 'Mixed' : 'Uncertified'}
                        </span>
                      )}
                      <button type="button" onClick={() => commit((current) => removeBlock(current, block.id))}>
                        {block.type === 'chapter' || block.type === 'scene' || block.type === 'section'
                          ? 'Remove heading'
                          : 'Remove'}
                      </button>
                    </div>
                  </article>
                </div>
              );
            })}
            <div
              className={`ms-insert-gap${dropAt === doc.blocks.length ? ' is-hot' : ''}`}
              data-insert-index={doc.blocks.length}
              onClick={() => onDictationTarget?.({ atIndex: doc.blocks.length })}
              onDragOver={(e) => {
                if (dragging == null) return;
                e.preventDefault();
                if (validDropIndices(doc.blocks, dragging).includes(doc.blocks.length)) setDropAt(doc.blocks.length);
              }}
              onDrop={(e) => {
                if (dragging == null) return;
                e.preventDefault();
                const from = dragging;
                setDragging(null);
                setDropAt(null);
                commit((current) => reorderBlocks(current, from, current.blocks.length, new Date().toISOString(), ids.current()));
              }}
            />
          </div>
        )}
        {!showPreview && (
          <p className="canvas-note">Drag a handle to reorder a chapter with the prose under it, or move a paragraph. Moving text keeps a keyboard seal on that text. Dropping words in from another app does not.</p>
        )}
        </div>
        </div>
      </main>

      <aside className={`points${certCollapsed ? ' is-collapsed' : ''}`}>
        <button
          type="button"
          className={`cert-collapse-toggle${certCollapsed ? ' is-collapsed-mark' : ''}`}
          onClick={() => setCertCollapsed((c) => !c)}
          aria-expanded={!certCollapsed}
          aria-label={certCollapsed ? 'Expand certification pane' : 'Collapse certification pane'}
          data-tooltip={certCollapsed ? 'Expand certification pane' : 'Collapse certification pane'}
        >
          {certCollapsed ? <CertificationMark size={26} /> : <span className="cert-collapse-chevron" aria-hidden="true">›</span>}
        </button>
        <div className="points-body">
          <div className="points-head">
            <div className="points-head__brand">
              <CertificationMark size={28} className="points-head__mark" />
              <div>
                <p className="eyebrow">Certification</p>
                <h2>Sealed passages</h2>
              </div>
            </div>
          </div>
          {doc.points.length === 0 && (
            <p className="points-empty">Nothing is sealed yet. Keyboard and dictated text land here with a content hash and the input events behind them. Pasted text never will.</p>
          )}
          {(doc.points.length > 0 || openCards.length > 0) && (
            <ol className="point-list" ref={pointListRef}>
              {doc.points.map((point) => (
                <li
                  key={point.id}
                  data-card-id={point.id}
                  data-origin={point.origin}
                  className={linkedCardId === point.id ? 'is-linked' : undefined}
                >
                  <header>
                    <span>{point.origin === 'dictation' ? 'Dictation, sealed' : 'Certified'}</span>
                    <time dateTime={point.updatedAt}>{new Date(point.updatedAt).toLocaleString()}</time>
                  </header>
                  <blockquote>{point.text}</blockquote>
                  <code title={point.contentHash}>{point.contentHash.slice(0, 16)}…</code>
                  <DeviceLine stored={point.typingDevice} live={liveDevice} />
                  <p>{point.evidence.eventCount} observed input event{point.evidence.eventCount === 1 ? '' : 's'} · {point.evidence.inputTypes.join(', ') || 'keyboard'}</p>
                  {point.lineage && <p className="lineage">{point.lineage}</p>}
                </li>
              ))}
              {openCards.length > 0 && doc.points.length > 0 && (
                <li className="point-list__divider">Not sealed</li>
              )}
              {openCards.map((card) => (
                <li
                  key={card.id}
                  data-card-id={card.id}
                  data-origin={card.origin}
                  className={`is-uncertified${linkedCardId === card.id ? ' is-linked' : ''}`}
                >
                  <header>
                    <span>Uncertified</span>
                    <span>{originWord(card.origin)}</span>
                  </header>
                  <blockquote>{card.text}</blockquote>
                </li>
              ))}
            </ol>
          )}
          {doc.moves.length > 0 && (
            <div className="moves">
              <h3>Moves</h3>
              <ul>
                {doc.moves.slice(-6).reverse().map((move) => (
                  <li key={move.id}>{move.label}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="primary" onClick={() => downloadJson(`${name}.certification.json`, certificationExport(doc, new Date().toISOString()))}>Download certification record</button>
        </div>
      </aside>
    </div>
  );
}

function DeviceLine({ stored, live }: { stored?: string; live: string | null }) {
  const label = formatTypingDeviceLabel(stored, live);
  if (!label) return null;
  return <p className="point-device">Device: {label}</p>;
}

function scrollCardIntoCertificationPane(card: HTMLElement) {
  if (card.getClientRects().length === 0) return;
  const pane = card.closest('.points-body');
  if (!(pane instanceof HTMLElement)) return;
  const bounds = pane.getBoundingClientRect();
  if (bounds.height < 24) return;
  const rect = card.getBoundingClientRect();
  const delta = scrollDelta(bounds.top, bounds.bottom, rect.top, rect.bottom);
  if (delta !== 0) pane.scrollTop += delta;
}

function originWord(origin: string): string {
  if (origin === 'dictation') return 'Dictation';
  if (origin === 'paste') return 'Paste';
  if (origin === 'drop') return 'Drop';
  if (origin === 'other') return 'Other';
  return 'Uncertified';
}
