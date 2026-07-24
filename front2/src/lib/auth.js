import { API_BASE } from '../config';

const STORAGE_KEY = 'mentor_app_session';

export function getStoredSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSession(session) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function apiLogin(username, password) {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: data.error || 'Login failed' };
  return { ok: true, session: data };
}

export async function apiLogout(token) {
  try {
    await fetch(`${API_BASE}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // best-effort, ignore network errors on logout
  }
}