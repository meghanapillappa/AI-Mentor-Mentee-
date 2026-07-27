// ---------------------------------------------------------------------------
// api.js
//
// Every fetch() call to the Flask backend lives here. Ported 1:1 from the
// original js/api.js — same URLs, same payload shapes, same error handling.
// ---------------------------------------------------------------------------

import { API_BASE } from '../config';

import { getStoredSession } from './auth';

function authHeaders() {
  const session = getStoredSession();
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

function handleAuthFailure(response) {
  if (response.status === 401) {
    sessionStorage.removeItem('mentor_app_session');
    window.location.reload(); // App.jsx will see no session and show LoginPage
  }
}
async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Backend isn't reachable / isn't Flask responding (e.g. a 404 HTML page)
    throw new Error(
      `Could not reach the backend at ${API_BASE} (got a non-JSON response, ` +
      `status ${response.status}). Make sure app.py is running (python app.py) ` +
      `and reachable from this page.`
    );
  }
  return response.json();
}

/** POST /api/parse-file — upload a raw file, get back { mentors, mentees }. */
export async function apiParseFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  let response;
  try {
    response = await fetch(`${API_BASE}/api/parse-file`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: formData,
    });
  } catch (networkErr) {
    throw new Error(
      `Could not connect to ${API_BASE}. Make sure the Flask backend (python app.py) is running.`
    );
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to parse file');
  }
  return payload;
}

/** POST /api/save-file — returns a raw fetch Response (caller reads .blob()). */
export async function apiSaveFile(rows, format, filenameBase) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/save-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ rows, format, filename: filenameBase, table_name: filenameBase }),
    });
  } catch (networkErr) {
    throw new Error(
      `Could not connect to ${API_BASE}. Make sure the Flask backend (python app.py) is running.`
    );
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to save file');
    }
    throw new Error(
      `Backend did not return a valid file (status ${response.status}). ` +
      `Make sure app.py is running at ${API_BASE}.`
    );
  }
  return response;
}

/** POST /api/match — run the full balancing algorithm. Returns cohorts (throws on error). */
export async function apiRunMatch(students, mentors, excludedMentors = []) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ students, mentors, excluded_mentors: excludedMentors }),
    });
  } catch (networkErr) {
    throw new Error(
      `Could not connect to ${API_BASE}. Make sure the Flask backend (python app.py) is running.`
    );
  }

  const cohorts = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(cohorts.error || 'Internal execution error returned from algorithm api framework.');
  }
  return cohorts;
}

/** POST /api/rebalance-add — returns { ok, data|error } instead of throwing. */
export async function apiRebalanceAdd(cohorts, newMentorName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/rebalance-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' ,...authHeaders() },
      body: JSON.stringify({ cohorts, new_mentor: newMentorName }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to add mentor "${newMentorName}".` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data };
}

/** POST /api/rebalance-remove — same { ok, data|error } shape as apiRebalanceAdd. */
export async function apiRebalanceRemove(cohorts, removedMentorName, excludedMentors = []) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/rebalance-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',...authHeaders() },
      body: JSON.stringify({ cohorts, removed_mentor: removedMentorName, excluded_mentors: excludedMentors }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to remove mentor "${removedMentorName}".` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data };
}

/** GET /api/my-cohort — mentor fetches their own published cohort. Returns { ok, cohort|error }. */
export async function apiGetMyCohort() {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/my-cohort`, {
      method: 'GET',
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to fetch your cohort.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, cohort: data.cohort };
}

/** POST /api/save-match-to-db — persists mentors/mentees to the DB with mentor/mentee roles.
 * Returns { ok, data|error }. data.created_accounts is the list of brand-new logins to distribute. */
export async function apiSaveMatchToDb(mentors, cohorts) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/save-match-to-db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ mentors, cohorts }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to save the match.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data };
}

/** DELETE /api/directory-accounts — removes every mentor/mentee account (admins untouched). */
export async function apiClearDirectoryAccounts() {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/directory-accounts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ confirm: true }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to clear accounts.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data };
}

/** POST /api/mentee-sessions — mentor records a session note for one of their mentees. */
export async function apiAddMenteeSession(menteeUsername, sessionData) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/mentee-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ mentee_username: menteeUsername, ...sessionData }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to save the session.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data };
}
