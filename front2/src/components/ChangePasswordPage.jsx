import { useState } from 'react';
import { apiRequestPasswordChange } from '../lib/api';

export default function ChangePasswordPage({ onBack }) {
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    const result = await apiRequestPasswordChange(username, currentPassword, newPassword);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message);
    setUsername('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>Request a Password Change</h1>
        <p className="login-subtitle">
          Your new password only becomes active once an admin approves it.
          Your current password keeps working in the meantime.
        </p>

        <div className="upload-group">
          <label>Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="upload-group">
          <label>Current password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="upload-group">
          <label>New password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="upload-group">
          <label>Confirm new password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>

        {error && <div className="status-line err">{error}</div>}
        {message && <div className="status-line ok">{message}</div>}

        <button type="submit" className="action-btn" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
        <button type="button" className="ghost-btn" onClick={onBack}>← Back to login</button>
      </form>
    </div>
  );
}