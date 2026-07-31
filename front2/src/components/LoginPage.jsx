import { useState } from 'react';
import ChangePasswordPage from './ChangePasswordPage';
import ForgotPasswordPage from './ForgotPasswordPage';



export default function LoginPage({ onLogin, error, loading }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);



  const submit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  if (showChangePassword) {
    return <ChangePasswordPage onBack={() => setShowChangePassword(false)} />;
  }

  if (showForgotPassword) {
    return <ForgotPasswordPage onBack={() => setShowForgotPassword(false)} />;
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>Mentor Distribution Engine</h1>
        <p className="login-subtitle">Sign in to continue</p>

        <div className="upload-group">
          <label>Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="upload-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <div className="status-line err">{error}</div>}

        <button type="submit" className="action-btn" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <button type="button" className="ghost-btn" onClick={() => setShowChangePassword(true)}>
          Change Password
       </button>
       <button type="button" className="ghost-btn" onClick={() => setShowForgotPassword(true)}>
          Forgot Password?
      </button>
      </form>
    </div>
  );
}