export function ManuscriptSelectBanner({
  count,
  onCombine,
  onDelete,
}: {
  count: number;
  onCombine: () => void;
  onDelete: () => void;
}) {
  const label =
    count === 0
      ? 'Select paragraphs to combine or delete'
      : count === 1
        ? '1 paragraph selected'
        : `${count} paragraphs selected`;

  return (
    <div className="ms-select-banner" role="region" aria-label="Paragraph actions">
      <span className="ms-select-banner-copy">{label}</span>
      <div className="ms-select-banner-actions">
        <button
          type="button"
          className="btn compact"
          disabled={count < 2}
          title={count < 2 ? 'Select at least two paragraphs' : 'Join selected paragraphs in document order'}
          onClick={onCombine}
        >
          Combine
        </button>
        <button
          type="button"
          className="btn compact danger"
          disabled={count < 1}
          title="Delete the selected paragraphs"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
