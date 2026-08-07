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
  if (response?.status === 401) {
    sessionStorage.removeItem('mentor_app_session');
    window.location.reload(); // App.jsx will see no session and show LoginPage
  }
}

async function parseJsonResponse(response) {
  handleAuthFailure(response);

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

  handleAuthFailure(response);

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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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

/** GET /api/my-profile — mentee fetches their own profile, mentor info, and session history. */
export async function apiGetMyProfile() {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/my-profile`, {
      method: 'GET',
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to fetch your profile.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, profile: data.profile, mentor: data.mentor, sessions: data.sessions, username: data.username };
}

/** PATCH /api/my-profile — mentee updates their own about_me/goals/interests/contact fields. */
export async function apiUpdateMyProfile(fields) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/my-profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(fields),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to save your profile.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, profile: data.profile };
}

/** GET /api/messages — fetch the logged-in mentor/mentee's message thread. Mentors must pass menteeUsername. */
export async function apiGetMessages(menteeUsername) {
  const qs = menteeUsername ? `?mentee_username=${encodeURIComponent(menteeUsername)}` : '';
  let response;
  try {
    response = await fetch(`${API_BASE}/api/messages${qs}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to load messages.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, messages: data.messages };
}

/** POST /api/messages — send a message. Mentors must include menteeUsername. */
export async function apiSendMessage(text, menteeUsername) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text, ...(menteeUsername ? { mentee_username: menteeUsername } : {}) }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to send the message.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, message: data.message };
}

/** POST /api/save-match-to-db — persists mentors/mentees to the DB with mentor/mentee roles. */
/** POST /api/save-match-to-db — persists mentors/mentees to the DB with mentor/mentee roles. */
export async function apiSaveMatchToDb(mentors, cohorts, workspaceDbName, auditLog = []) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/save-match-to-db`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ mentors, cohorts, workspace: workspaceDbName, audit_log: auditLog }),
    });
  }
  catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to save the match.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data };
}

/** DELETE /api/directory-accounts — removes every mentor/mentee account (admins untouched). */
export async function apiClearDirectoryAccounts(workspaceDbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/directory-accounts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ confirm: true, workspace: workspaceDbName }),
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

/** GET /api/workspaces — list all workspace databases with mentor/mentee counts. */
export async function apiListWorkspaces() {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/workspaces`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to list workspaces.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data: data.workspaces };
}

/** POST /api/workspaces — create (or fetch, if the name already exists) a workspace. */
export async function apiCreateWorkspace(name) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to create the workspace.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}

/** DELETE /api/workspaces/:dbName — permanently drops a workspace's entire database. */
export async function apiDeleteWorkspace(dbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(dbName)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ confirm: true }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to delete the workspace.` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}

export async function apiListDeadlines(workspaceDbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/deadlines?workspace=${encodeURIComponent(workspaceDbName)}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to load deadlines.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data: data.deadlines };
}

/** POST /api/deadlines — create/update a session's deadline. */
export async function apiSetDeadline(workspaceDbName, sessionNumber, deadline) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/deadlines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ workspace: workspaceDbName, session_number: sessionNumber, deadline }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to save the deadline.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}

/** DELETE /api/deadlines/:sessionNumber?workspace=... */
export async function apiDeleteDeadline(workspaceDbName, sessionNumber) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/deadlines/${sessionNumber}?workspace=${encodeURIComponent(workspaceDbName)}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to delete the deadline.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}

/** POST /api/deadlines/extend — grant a mentor a past-deadline exception for one session. */
export async function apiGrantExtension(workspaceDbName, sessionNumber, mentorUsername) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/deadlines/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ workspace: workspaceDbName, session_number: sessionNumber, mentor_username: mentorUsername }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to grant the extension.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}

/** DELETE /api/deadlines/extend — revoke a previously granted extension. */
export async function apiRevokeExtension(workspaceDbName, sessionNumber, mentorUsername) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/deadlines/extend`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ workspace: workspaceDbName, session_number: sessionNumber, mentor_username: mentorUsername }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to revoke the extension.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}

/** GET /api/my-deadlines — the logged-in mentor/mentee's own workspace deadlines, with days-left computed. */
export async function apiGetMyDeadlines() {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/my-deadlines`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to load deadlines.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, deadlines: data.deadlines };
}

/** GET /api/deadlines/overdue-mentors?workspace=... */
export async function apiGetOverdueMentors(workspaceDbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/deadlines/overdue-mentors?workspace=${encodeURIComponent(workspaceDbName)}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to load overdue mentors.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data: data.overdue };
}

/** POST /api/password-requests — no auth needed, identity proven via current password. */
export async function apiRequestPasswordChange(username, currentPassword, newPassword) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/password-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, current_password: currentPassword, new_password: newPassword }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, message: data.message };
}

/** GET /api/password-requests?workspace=... — omit workspace for admin-account requests. */
export async function apiListPasswordRequests(workspaceDbName) {
  let response;
  try {
    const query = workspaceDbName ? `?workspace=${encodeURIComponent(workspaceDbName)}` : '';
    response = await fetch(`${API_BASE}/api/password-requests${query}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data: data.requests };
}

/** POST /api/password-requests/:id/approve */
export async function apiApprovePasswordRequest(requestId, workspaceDbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/password-requests/${requestId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ workspace: workspaceDbName || null }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, message: data.message, generatedPassword: data.generated_password };
}

/** POST /api/password-requests/:id/reject */
export async function apiRejectPasswordRequest(requestId, workspaceDbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/password-requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ workspace: workspaceDbName || null }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, message: data.message };
}

/** POST /api/forgot-password — no auth needed, no current password needed. */
export async function apiForgotPassword(username) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, message: data.message };
}


/** GET /api/db-viewer/collections?workspace=... (omit for control db) */
export async function apiListCollections(workspaceDbName) {
  let response;
  try {
    const query = workspaceDbName ? `?workspace=${encodeURIComponent(workspaceDbName)}` : '';
    response = await fetch(`${API_BASE}/api/db-viewer/collections${query}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data: data.collections };
}

/** GET /api/db-viewer/documents?workspace=...&collection=...&page=...&limit=... */
export async function apiListDocuments(workspaceDbName, collectionName, page = 1, limit = 20) {
  let response;
  try {
    const params = new URLSearchParams({ collection: collectionName, page, limit });
    if (workspaceDbName) params.set('workspace', workspaceDbName);
    response = await fetch(`${API_BASE}/api/db-viewer/documents?${params}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}

/** GET /api/db-viewer/directory-as-cohorts?workspace=... — cohort-shaped view of the directory collection. */
export async function apiGetDirectoryAsCohorts(workspaceDbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/db-viewer/directory-as-cohorts?workspace=${encodeURIComponent(workspaceDbName)}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE}.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, cohorts: data.cohorts };
}

/** GET /api/mentee-sessions/:username — Admin fetches a specific mentee's session history. */
export async function apiGetMenteeSessionsAdmin(menteeUsername, workspaceDbName) {
  let response;
  try {
    const query = workspaceDbName ? `?workspace=${encodeURIComponent(workspaceDbName)}` : '';
    response = await fetch(`${API_BASE}/api/mentee-sessions/${encodeURIComponent(menteeUsername)}${query}`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to load sessions.` };
  }
  
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  
  return { ok: true, sessions: data.sessions, mentee_username: data.mentee_username };
}

/** GET /api/workspaces/:dbName/load — loads a full workspace back into the matching engine. */
export async function apiLoadWorkspace(dbName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(dbName)}/load`, {
      headers: { ...authHeaders() },
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to load workspace.` };
  }
  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) return { ok: false, error: data.error || 'Unknown error' };
  return { ok: true, data };
}