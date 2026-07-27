export default function NewCredentialsModal({ result, onClose }) {
  if (!result) return null;
  const { accounts, mentorsSaved, menteesSaved } = result;

  const downloadCsv = () => {
    const header = 'name,username,role,password\n';
    const rows = accounts
      .map(a => [a.name, a.username, a.role, a.password].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'new_mentor_mentee_credentials.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <h3>Match saved to database</h3>
            <p>{mentorsSaved} mentor{mentorsSaved === 1 ? '' : 's'} and {menteesSaved} mentee{menteesSaved === 1 ? '' : 's'} synced.</p>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {accounts.length === 0 ? (
          <div className="modal-table-wrapper">
            <p className="empty-note">
              No new accounts were created — everyone already had a login, only their profile/assignment was updated.
            </p>
          </div>
        ) : (
          <>
            <div className="modal-table-wrapper">
              <table className="modal-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.username}>
                      <td>{a.name}</td>
                      <td className="col-mono">{a.username}</td>
                      <td>{a.role}</td>
                      <td className="col-mono">{a.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ padding: '8px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
              These passwords are shown once and can't be retrieved again — download or copy them now.
            </p>
          </>
        )}

        <div className="modal-footer">
          {accounts.length > 0 && (
            <button className="ghost-btn download-btn" onClick={downloadCsv}>Download CSV</button>
          )}
          <button className="action-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}