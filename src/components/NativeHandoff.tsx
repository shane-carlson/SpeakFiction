import { useCallback, useEffect, useState } from 'react';
import type { Book } from '../core/types';
import { getGenre } from '../core/genres';
import {
  handoffAppLabel,
  liveInsertIsEmpty,
  toLiveInsertRtf,
  toLiveInsertText,
  type HandoffAppId,
} from '../core/handoff';
import { loadExportImages } from '../core/mediaStore';
import type { HandoffSendResult, HandoffStatus } from '../speakfiction';

function nativeHandoff() {
  return window.speakfiction?.handoff;
}

function reasonMessage(result: HandoffSendResult): string {
  switch (result.reason) {
    case 'no-accessibility':
      return 'macOS Accessibility is off for SpeakFiction. Enable it, then send again.';
    case 'not-installed':
      return 'That app is not installed in Applications.';
    case 'empty':
      return 'Dictate or add manuscript text before sending.';
    case 'unsupported':
      return 'Live send is only available in the SpeakFiction Mac app.';
    case 'paste-failed':
      return result.detail
        ? `Could not paste: ${result.detail}`
        : 'Could not paste. Check Accessibility and that a document is open.';
    default:
      return 'Could not send the manuscript.';
  }
}

export function NativeHandoff({ book }: { book: Book }) {
  const bridge = nativeHandoff();
  const [status, setStatus] = useState<HandoffStatus | null>(null);
  const [busy, setBusy] = useState<HandoffAppId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const empty = liveInsertIsEmpty(book.manuscript);
  const genre = getGenre(book.genreId);
  const [payload, setPayload] = useState({ text: '', rtf: '' });

  useEffect(() => {
    let alive = true;
    const ctx = { title: book.title, genre };
    const text = toLiveInsertText(book.manuscript, ctx);
    void loadExportImages(book.manuscript).then((images) => {
      if (!alive) return;
      setPayload({
        text,
        rtf: toLiveInsertRtf(book.manuscript, { ...ctx, images }),
      });
    });
    return () => {
      alive = false;
    };
  }, [book.manuscript, book.title, genre]);

  const refresh = useCallback(async () => {
    if (!bridge) return;
    setStatus(await bridge.getStatus());
  }, [bridge]);

  useEffect(() => {
    void refresh();
    if (!bridge) return;
    const id = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(id);
  }, [bridge, refresh]);

  const platform = window.speakfiction?.platform;
  const macOnly = !bridge || platform === 'win32' || platform === 'linux' || status?.available === false;
  if (macOnly) {
    return (
      <div className="note-banner">
        <span className="ico">🖥️</span>
        <div>
          <b>Live send to Scrivener, Word, or LibreOffice</b> is Mac only (Accessibility).
          {platform === 'win32'
            ? ' On Windows, export a file below and open it in your writing app.'
            : ' This preview can still export files below.'}
        </div>
      </div>
    );
  }

  const trusted = Boolean(status?.trusted);
  const targets = status?.targets ?? [
    { id: 'scrivener' as const, name: 'Scrivener', installed: false, running: false },
    { id: 'word' as const, name: 'Microsoft Word', installed: false, running: false },
    { id: 'libreoffice' as const, name: 'LibreOffice', installed: false, running: false },
  ];
  const send = async (appId: HandoffAppId) => {
    setMessage(null);
    setBusy(appId);
    try {
      const result = await bridge.send(appId, payload);
      if (result.status) setStatus(result.status);
      else await refresh();
      const label = handoffAppLabel(appId);
      if (result.ok) {
        setMessage(
          result.launched
            ? `Opened ${label} and pasted at the cursor. Place the cursor in a document first next time if the paste landed in the wrong place.`
            : `Pasted into ${label} at the cursor.`,
        );
      } else {
        setMessage(reasonMessage(result));
      }
    } finally {
      setBusy(null);
    }
  };

  const enable = async () => {
    setMessage(null);
    const next = await bridge.requestAccess();
    setStatus(next);
    if (!next.trusted) {
      await bridge.openPrivacySettings();
      setMessage(
        'Turn on SpeakFiction in Privacy & Security → Accessibility, then return here. You may need to restart the app once after enabling it.',
      );
    }
  };

  return (
    <div className="handoff-panel">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Live send</h3>
        <span className={`badge ${trusted ? 'item' : ''}`}>
          {trusted ? 'Accessibility allowed' : 'Accessibility needed'}
        </span>
      </div>
      <p className="sub">
        Inserts the manuscript at the cursor in an open document. This does not create Scrivener
        binder documents — use Export for Import and Split for that.
      </p>
      {!trusted && (
        <div className="row wrap" style={{ marginBottom: 12, gap: 8 }}>
          <button className="btn primary" type="button" onClick={() => void enable()}>
            Enable Accessibility
          </button>
          <button className="btn ghost" type="button" onClick={() => void bridge.openPrivacySettings()}>
            Open Privacy settings
          </button>
        </div>
      )}
      <div className="handoff-targets">
        {targets.map((t) => (
          <div key={t.id} className="handoff-target">
            <div>
              <div className="name">{t.name}</div>
              <div className="hint">
                {!t.installed
                  ? 'Not installed'
                  : t.running
                    ? 'Running — paste into the front document'
                    : 'Installed — will open, then paste'}
              </div>
            </div>
            <button
              className="btn primary"
              type="button"
              disabled={!trusted || !t.installed || empty || busy != null}
              onClick={() => void send(t.id)}
            >
              {busy === t.id ? 'Sending…' : `Send to ${handoffAppLabel(t.id)}`}
            </button>
          </div>
        ))}
      </div>
      {empty && <div className="hint">Add manuscript text on Dictate before sending.</div>}
      {message && <div className="hint" style={{ marginTop: 10 }}>{message}</div>}
    </div>
  );
}
