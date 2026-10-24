export function ManuscriptTable({
  rows,
  onCellChange,
  onAddRow,
  onAddColumn,
  onRemoveRow,
}: {
  rows: string[][] | undefined;
  onCellChange: (row: number, col: number, value: string) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onRemoveRow: () => void;
}) {
  const data = rows?.length ? rows : [['', '', ''], ['', '', '']];
  const colCount = Math.max(...data.map((r) => r.length), 1);

  return (
    <div className="ms-table-wrap">
      <table className="ms-table">
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri}>
              {Array.from({ length: colCount }, (_, ci) => (
                <td key={ci}>
                  <input
                    type="text"
                    className="ms-table-cell"
                    value={row[ci] ?? ''}
                    onChange={(e) => onCellChange(ri, ci, e.target.value)}
                    aria-label={`Row ${ri + 1}, column ${ci + 1}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ms-table-tools">
        <button type="button" onClick={onAddRow}>Add row</button>
        <button type="button" onClick={onAddColumn}>Add column</button>
        <button type="button" onClick={onRemoveRow} disabled={data.length <= 1}>Remove last row</button>
      </div>
      <p className="ms-table-note">Table cells are not keyboard-certified; seal prose in paragraphs.</p>
    </div>
  );
}
