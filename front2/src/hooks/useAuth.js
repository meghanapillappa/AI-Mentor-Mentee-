import { useCallback, useState } from 'react';
import { getStoredSession, storeSession, clearSession, apiLogin, apiLogout } from '../lib/auth';

export function useAuth() {
  const [session, setSession] = useState(() => getStoredSession());
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const login = useCallback(async (username, password) => {
    setLoggingIn(true);
    setLoginError('');
    const result = await apiLogin(username, password);
    setLoggingIn(false);
    if (!result.ok) { setLoginError(result.error); return false; }
    storeSession(result.session);
    setSession(result.session);
    return true;
  }, []);

  const logout = useCallback(() => {
    if (session?.token) apiLogout(session.token);
    clearSession();
    setSession(null);
  }, [session]);

  return {
    session,
    isAuthenticated: !!session,
    isAdmin: session?.role === 'admin',
    login,
    logout,
    loginError,
    loggingIn,
  };
}