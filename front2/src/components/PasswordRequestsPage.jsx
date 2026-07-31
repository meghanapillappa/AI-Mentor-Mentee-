import { useEffect, useState } from 'react';
import {
  apiListPasswordRequests,
  apiApprovePasswordRequest,
  apiRejectPasswordRequest,
} from '../lib/api';
import WorkspaceSelector from './WorkspaceSelector';

export default function PasswordRequestsPage({ activeWorkspace, setActiveWorkspace, onBack }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    const result = await apiListPasswordRequests(activeWorkspace?.db_name);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setError('');
    setRequests(result.data);
  };

  useEffect(() => { refresh(); }, [activeWorkspace?.db_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = async (requestId) => {
    const result = await apiApprovePasswordRequest(requestId, activeWorkspace?.db_name);
    if (!result.ok) { setError(result.error); return; }
    if (result.generatedPassword) {
      alert(`New password for this account:\n\n${result.generatedPassword}\n\nShare this with them directly — it will not be shown again.`);
    }
    refresh();
  };

  const reject = async (requestId) => {
    const result = await apiRejectPasswordRequest(requestId, activeWorkspace?.db_name);
    if (!result.ok) { setError(result.error); return; }
    refresh();
  };

  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Password Change Requests</h1>
          <p>{activeWorkspace ? `Database: ${activeWorkspace.name}` : 'Showing admin-account requests'}</p>
        </div>
        <button className="ghost-btn" onClick={onBack}>← Back</button>
      </header>

      <div className="sidebar-panel" style={{ marginBottom: 20, maxWidth: 420 }}>
        <WorkspaceSelector activeWorkspace={activeWorkspace} onSelect={setActiveWorkspace} />
        <small>Leave unselected to review admin-account requests instead of a workspace's mentors/mentees.</small>
      </div>

      {error && <div className="status-line err" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <p className="empty-note">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="empty-note">No pending password change requests.</p>
      ) : (
        <div className="dataset-editor">
          <table className="editable-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Type</th>
                <th>Requested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.request_id}>
                  <td style={{ padding: '7px 10px' }}>{r.username}</td>
                  <td style={{ padding: '7px 10px' }}>{r.role}</td>
                  <td style={{ padding: '7px 10px' }}>{r.type === 'forgot' ? 'Forgot password' : 'Change password'}</td>
                  <td style={{ padding: '7px 10px' }}>{new Date(r.requested_at).toLocaleString('en-GB')}</td>
                  <td className="row-remove" style={{ width: 'auto', padding: '7px 10px', display: 'flex', gap: 6 }}>
                    <button className="ghost-btn" onClick={() => approve(r.request_id)}>Approve</button>
                    <button className="ghost-btn" onClick={() => reject(r.request_id)}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}