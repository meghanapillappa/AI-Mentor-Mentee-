import { useState } from 'react';
import { apiForgotPassword } from '../lib/api';

export default function ForgotPasswordPage({ onBack }) {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!username.trim()) return;

    setSubmitting(true);
    const result = await apiForgotPassword(username.trim());
    setSubmitting(false);

    if (!result.ok) { setError(result.error); return; }
    setMessage(result.message);
    setUsername('');
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>Forgot Password</h1>
        <p className="login-subtitle">
          An admin will generate a new password for you and share it directly — no email needed.
        </p>

        <div className="upload-group">
          <label>Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>

        {error && <div className="status-line err">{error}</div>}
        {message && <div className="status-line ok">{message}</div>}

        <button type="submit" className="action-btn" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Request Reset'}
        </button>
        <button type="button" className="ghost-btn" onClick={onBack}>← Back to login</button>
      </form>
    </div>
  );
}