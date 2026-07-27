import { useEffect, useState } from 'react';
import {
  apiListDeadlines,
  apiSetDeadline,
  apiDeleteDeadline,
  apiGrantExtension,
  apiRevokeExtension,
} from '../lib/api';
import WorkspaceSelector from './WorkspaceSelector';

export default function DeadlinesPage({ activeWorkspace, setActiveWorkspace, onBack }) {
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [newSessionNumber, setNewSessionNumber] = useState('');
  const [newDeadline, setNewDeadline] = useState('');

  const [extendInputs, setExtendInputs] = useState({}); // sessionNumber -> mentor username being typed

  const refresh = async () => {
    if (!activeWorkspace?.db_name) return;
    setLoading(true);
    const result = await apiListDeadlines(activeWorkspace.db_name);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setError('');
    setDeadlines(result.data);
  };

  useEffect(() => { refresh(); }, [activeWorkspace?.db_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const addDeadline = async () => {
    const sessionNumber = parseInt(newSessionNumber, 10);
    if (!sessionNumber || !newDeadline) return;
    const result = await apiSetDeadline(activeWorkspace.db_name, sessionNumber, newDeadline);
    if (!result.ok) { setError(result.error); return; }
    setNewSessionNumber('');
    setNewDeadline('');
    refresh();
  };

  const updateDeadline = async (sessionNumber, deadline) => {
    const result = await apiSetDeadline(activeWorkspace.db_name, sessionNumber, deadline);
    if (!result.ok) { setError(result.error); return; }
    refresh();
  };

  const removeDeadline = async (sessionNumber) => {
    if (!window.confirm(`Remove the deadline for Session ${sessionNumber}? Mentors will then be able to submit it any time.`)) return;
    const result = await apiDeleteDeadline(activeWorkspace.db_name, sessionNumber);
    if (!result.ok) { setError(result.error); return; }
    refresh();
  };

  const grantExtension = async (sessionNumber) => {
    const mentorUsername = (extendInputs[sessionNumber] || '').trim();
    if (!mentorUsername) return;
    const result = await apiGrantExtension(activeWorkspace.db_name, sessionNumber, mentorUsername);
    if (!result.ok) { setError(result.error); return; }
    setExtendInputs(prev => ({ ...prev, [sessionNumber]: '' }));
    refresh();
  };

  const revokeExtension = async (sessionNumber, mentorUsername) => {
    const result = await apiRevokeExtension(activeWorkspace.db_name, sessionNumber, mentorUsername);
    if (!result.ok) { setError(result.error); return; }
    refresh();
  };

  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Session Deadlines</h1>
          <p>Database: {activeWorkspace ? activeWorkspace.name : 'None selected'}</p>
        </div>
        <button className="ghost-btn" onClick={onBack}>← Back</button>
      </header>

      <div className="sidebar-panel" style={{ marginBottom: 20, maxWidth: 420 }}>
        <WorkspaceSelector activeWorkspace={activeWorkspace} onSelect={setActiveWorkspace} />
      </div>

      {!activeWorkspace && (
        <p className="empty-note">Select or create a database above to manage its deadlines.</p>
      )}

      {error && <div className="status-line err" style={{ marginBottom: 16 }}>{error}</div>}

      {activeWorkspace && (
        <>
          <div className="dataset-editor">
            <div className="dataset-editor-header">
              <h3>Add a session deadline</h3>
            </div>
            <div className="save-row">
              <input
                type="number"
                placeholder="Session #"
                value={newSessionNumber}
                onChange={(e) => setNewSessionNumber(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
              />
              <button className="action-btn" onClick={addDeadline} disabled={!newSessionNumber || !newDeadline}>
                Add
              </button>
            </div>
          </div>

          {loading ? (
            <p className="empty-note">Loading…</p>
          ) : deadlines.length === 0 ? (
            <p className="empty-note">No deadlines set yet — mentors can submit any session at any time until you add one.</p>
          ) : (
            deadlines.map(d => (
              <div className="dataset-editor" key={d.session_number}>
                <div className="dataset-editor-header">
                  <h3>Session {d.session_number}</h3>
                  <button className="ghost-btn" onClick={() => removeDeadline(d.session_number)}>Remove deadline</button>
                </div>

                <div className="save-row" style={{ marginBottom: 12 }}>
                  <input
                    type="date"
                    value={d.deadline ? d.deadline.slice(0, 10) : ''}
                    onChange={(e) => updateDeadline(d.session_number, e.target.value)}
                  />
                  <span className="status-line">
                    {d.deadline ? `Due ${new Date(d.deadline).toLocaleDateString('en-GB')}` : 'No date set'}
                  </span>
                </div>

                <div className="dataset-editor-header">
                  <h3 style={{ fontSize: 12.5 }}>Mentors allowed past this deadline</h3>
                </div>
                <div className="realloc-student-list" style={{ marginBottom: 10 }}>
                  {(d.extensions || []).length === 0 && (
                    <span className="status-line">No exceptions granted.</span>
                  )}
                  {(d.extensions || []).map(mentorUsername => (
                    <span className="realloc-student-chip" key={mentorUsername}>
                      {mentorUsername}
                      <button
                        onClick={() => revokeExtension(d.session_number, mentorUsername)}
                        style={{ marginLeft: 6, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                        title="Revoke this mentor's extension"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="save-row">
                  <input
                    type="text"
                    placeholder="Mentor username…"
                    value={extendInputs[d.session_number] || ''}
                    onChange={(e) => setExtendInputs(prev => ({ ...prev, [d.session_number]: e.target.value }))}
                  />
                  <button className="ghost-btn" onClick={() => grantExtension(d.session_number)}>
                    Grant extension
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}