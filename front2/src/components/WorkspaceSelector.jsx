import { useEffect, useState } from 'react';
import { apiListWorkspaces, apiCreateWorkspace } from '../lib/api';

export default function WorkspaceSelector({ activeWorkspace, onSelect }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    const result = await apiListWorkspaces();
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setWorkspaces(result.data);
    if (!activeWorkspace && result.data.length > 0) {
      onSelect(result.data[0]);
    }
  };

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createNew = async () => {
    if (!newName.trim()) return;
    setError('');
    const result = await apiCreateWorkspace(newName.trim());
    if (!result.ok) { setError(result.error); return; }
    setNewName('');
    await refresh();
    onSelect(result.data);
  };

  return (
    <div className="upload-group">
      <label>Database (workspace)</label>
      <select
        value={activeWorkspace?.db_name || ''}
        onChange={(e) => {
          const ws = workspaces.find(w => w.db_name === e.target.value);
          if (ws) onSelect(ws);
        }}
      >
        <option value="" disabled>{loading ? 'Loading…' : 'Select a database…'}</option>
        {workspaces.map(w => (
          <option key={w.db_name} value={w.db_name}>
            {w.name} ({w.mentor_count} mentors, {w.mentee_count} mentees)
          </option>
        ))}
      </select>

      <div className="save-row" style={{ marginTop: 6 }}>
        <input
          type="text"
          placeholder="New database name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="ghost-btn" onClick={createNew} disabled={!newName.trim()}>Create</button>
      </div>

      {error && <div className="status-line err">{error}</div>}
      <small>Each database keeps its own separate mentor/mentee accounts, isolated from every other one.</small>
    </div>
  );
}