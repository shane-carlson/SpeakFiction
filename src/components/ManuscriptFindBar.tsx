import { useEffect, useRef } from 'react';

export function ManuscriptFindBar({
  query,
  replacement,
  caseSensitive,
  matchIndex,
  matchCount,
  focusNonce,
  onQuery,
  onReplacement,
  onCaseSensitive,
  onPrev,
  onNext,
  onReplace,
  onReplaceAll,
  onClose,
}: {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  matchIndex: number;
  matchCount: number;
  focusNonce?: number;
  onQuery: (value: string) => void;
  onReplacement: (value: string) => void;
  onCaseSensitive: (value: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = findRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [focusNonce]);

  const status = !query ? '' : matchCount ? `${matchIndex + 1} of ${matchCount}` : 'No matches';

  return (
    <form
      className="ms-find-bar"
      role="search"
      aria-label="Find and replace in manuscript"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <input
        ref={findRef}
        className="ms-find-input"
        type="search"
        value={query}
        placeholder="Find"
        aria-label="Find"
        autoComplete="off"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          }
        }}
      />
      <input
        className="ms-find-input"
        type="text"
        value={replacement}
        placeholder="Replace"
        aria-label="Replace"
        autoComplete="off"
        onChange={(e) => onReplacement(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onReplace();
          }
        }}
      />
      <span className="ms-find-status" aria-live="polite">
        {status}
      </span>
      <button type="button" className="btn compact ghost" onClick={onPrev} disabled={!matchCount} title="Previous match">
        Prev
      </button>
      <button type="button" className="btn compact ghost" onClick={onNext} disabled={!matchCount} title="Next match">
        Next
      </button>
      <button type="button" className="btn compact" onClick={onReplace} disabled={!matchCount}>
        Replace
      </button>
      <button type="button" className="btn compact" onClick={onReplaceAll} disabled={!query}>
        Replace all
      </button>
      <label className="ms-find-case">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => onCaseSensitive(e.target.checked)}
        />
        Match case
      </label>
      <button type="button" className="btn compact ghost" onClick={onClose} aria-label="Close find">
        ✕
      </button>
    </form>
  );
}
