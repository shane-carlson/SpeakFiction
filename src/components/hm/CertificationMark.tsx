/** Lock with green check — visual mark for the certification pane. */
export function CertificationMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`cert-mark${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1zm2 0h6V7a3 3 0 0 0-6 0v3z"
      />
      <circle cx="17.5" cy="17.5" r="5.5" fill="var(--good, #2d8a4e)" />
      <path
        fill="#fff"
        d="M15.2 17.5l1.3 1.3 3.2-3.4 1.1 1.1-4.3 4.5-2.4-2.4 1.1-1.1z"
      />
    </svg>
  );
}
