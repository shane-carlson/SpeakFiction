import type { MouseEvent, ReactNode } from 'react';

export function ToolbarIconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`toolbar-icon-btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      data-tooltip={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  preserveAspectRatio: 'xMidYMid meet' as const,
  focusable: 'false' as const,
};

export function IconChapter() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M5 5h8v14H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M13 5h6v14h-6" />
      <path d="M9 9h2M9 13h2" />
    </svg>
  );
}

export function IconScene() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5l2-2h6l2 2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function IconSection() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M4 6h16M4 12h12M4 18h8" />
    </svg>
  );
}

export function IconParagraph() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M14 4v16" />
      <path d="M10 20H6a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h2a2 2 0 0 0 0-4H6" />
    </svg>
  );
}

export function IconTable() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 11h18M9 5v14M15 5v14" />
    </svg>
  );
}

export function IconImage() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-4 4-2-2-5 5" />
    </svg>
  );
}

export function IconPageBreak() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M7 5h10v14H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M9 12h6" strokeDasharray="3 3" />
      <path d="M17 8v8" />
    </svg>
  );
}

export function IconSceneBreak() {
  return (
    <svg {...iconProps} aria-hidden="true" fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="18" cy="12" r="1.25" />
    </svg>
  );
}

export function IconBlockQuote() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M7 7h4v6H8a2 2 0 0 1-2-2V7zM13 11h4v6h-3a2 2 0 0 1-2-2v-4z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBold() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M8 5h5.5a3.5 3.5 0 0 1 0 7H8V5zm0 7h6a3.5 3.5 0 0 1 0 7H8v-7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconItalic() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M14 5h-4M10 19h4M14 5l-4 14" />
    </svg>
  );
}

export function IconStrikethrough() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M4 12h16" />
      <path d="M7 7.5c.4-1.6 2-3 5-3 3.2 0 5 1.6 5 3.6 0 1.2-.6 2.1-1.6 2.8" />
      <path d="M8.2 16.2c.8 1.4 2.2 2.3 3.8 2.3 3.1 0 4.8-1.7 4.8-3.7 0-.7-.2-1.4-.5-2" />
    </svg>
  );
}

export function IconUnderline() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M6 5v5a6 6 0 0 0 12 0V5M4 19h16" />
    </svg>
  );
}

export function IconBulletList() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="5" cy="6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconNumberList() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="M4 6h1v4H4M4 16h2" />
    </svg>
  );
}

export function IconUndo() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11" />
    </svg>
  );
}

export function IconRedo() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" />
    </svg>
  );
}

export function IconManuscriptView() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M5 5h8v14H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M13 5h6v14h-6" />
    </svg>
  );
}

export function IconExportPreview() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M8 13h8" strokeDasharray="2.2 2.2" />
      <path d="M8 17h5" />
    </svg>
  );
}

export function IconFindPrevious() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M6 14l6-6 6 6" />
    </svg>
  );
}

export function IconFindNext() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M6 10l6 6 6-6" />
    </svg>
  );
}

export function IconReplace() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M5 7h8" />
      <path d="M5 17h14" />
      <path d="M15 4l3 3-3 3" />
    </svg>
  );
}

export function IconReplaceAll() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M4 8h10" />
      <path d="M4 16h10" />
      <path d="M15 5l3 3-3 3" />
      <path d="M15 13l3 3-3 3" />
    </svg>
  );
}

export function IconCertificationView() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M4 6h16v12H4z" />
      <path d="M7 10h4M7 14h7" stroke="var(--good, #2d8a4e)" />
      <path d="M14 9l2 2 3-4" stroke="var(--good, #2d8a4e)" />
    </svg>
  );
}
