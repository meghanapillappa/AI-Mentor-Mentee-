import { useMemo, useState } from 'react';

export default function DatasetEditor({ keyName, title, data, onChangeCell, onRemoveRow, onAddRow, onSave }) {
  const [format, setFormat] = useState('csv');

  // Union of all keys across rows, in first-seen order (internal _uid hidden)
  const columns = useMemo(() => {
    const cols = [];
    data.forEach(row =>
      Object.keys(row).forEach(k => {
        if (!k.startsWith('_') && !cols.includes(k)) cols.push(k);
      })
    );
    return cols;
  }, [data]);

  if (data.length === 0) return null;

  return (
    <div className="dataset-editor">
      <div className="dataset-editor-header">
        <h3>{title} data (editable)</h3>
        <span>{data.length} rows &middot; {columns.length} columns</span>
      </div>

      <div className="editable-table-wrapper">
        <table className="editable-table">
          <thead>
            <tr>
              {columns.map(col => <th key={col}>{col}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, rIdx) => (
              <tr key={row._uid ?? rIdx}>
                {columns.map(col => (
                  <td key={col}>
                    <input
                      type="text"
                      value={row[col] === undefined || row[col] === null ? '' : row[col]}
                      onChange={(e) => onChangeCell(rIdx, col, e.target.value)}
                    />
                  </td>
                ))}
                <td className="row-remove">
                  <button title="Remove row" onClick={() => onRemoveRow(rIdx)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dataset-editor-footer">
        <button className="ghost-btn" onClick={onAddRow}>+ Add row</button>
        <div className="save-row">
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="csv">Save as .csv</option>
            <option value="txt">Save as .txt</option>
            <option value="xlsx">Save as .xlsx</option>
            <option value="sql">Save as .sql</option>
          </select>
          <button className="ghost-btn" onClick={() => onSave(format)}>Save edited file</button>
        </div>
      </div>

      {keyName === 'mentors' && (
        <small style={{ display: 'block', marginTop: 8 }}>
          Once a match has run, adding or removing a mentor here automatically
          rebalances just that mentor's slice — everyone else's mapping stays put.
        </small>
      )}
    </div>
  );
}
