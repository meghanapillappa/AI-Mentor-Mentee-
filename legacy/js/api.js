// ---------------------------------------------------------------------------
// api.js
//
// Every fetch() call to the Flask backend lives here. Feature modules call
// these functions and never talk to `fetch` directly — that keeps the
// backend contract (URLs, payload shape, error handling) in exactly one
// place. If the backend API changes, this is the only file that should
// need updating.
// ---------------------------------------------------------------------------

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

// Cohorts are always meant to be an array of { mentor, students, ... }
// objects. Some backend edge cases (observed: exactly one mentor left after
// a removal) serialize the result as a single bare cohort object instead of
// a one-element array. Everything downstream (renderCohorts, the
// reallocation report, etc.) assumes an array, so normalize here — the one
// place the backend contract is defined — rather than in every caller.
function normalizeCohorts(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.cohorts)) return data.cohorts; // wrapped shape
  if (data && typeof data === 'object' && 'mentor' in data) return [data]; // single bare cohort
  console.error('Unexpected cohorts payload shape from backend:', data);
  return [];
}

/** POST /api/parse-file — upload a raw file, get back { columns, rows }. */
async function apiParseFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  let response;
  try {
    response = await fetch(`${API_BASE}/api/parse-file`, {
      method: 'POST',
      body: formData
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
  return payload; // { columns, rows }
}

/** POST /api/save-file — returns a raw fetch Response (caller reads .blob()). */
async function apiSaveFile(rows, format, filenameBase) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/save-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, format, filename: filenameBase, table_name: filenameBase })
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
async function apiRunMatch(students, mentors, excludedMentors = []) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students, mentors, excluded_mentors: excludedMentors }),    
    });
  } catch (networkErr) {
    throw new Error(
      `Could not connect to ${API_BASE}. Make sure the Flask backend (python app.py) is running.`
    );
  }

  const cohorts = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(cohorts.error || "Internal execution error returned from algorithm api framework.");
  }
  return cohorts;
}

/** POST /api/rebalance-add — returns { ok, data } instead of throwing, since callers alert() on failure. */
async function apiRebalanceAdd(cohorts, newMentorName) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/rebalance-add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohorts, new_mentor: newMentorName })
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to add mentor "${newMentorName}".` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data: normalizeCohorts(data) };
}

/** POST /api/rebalance-remove — same { ok, data } shape as apiRebalanceAdd. */
async function apiRebalanceRemove(cohorts, removedMentorName, excludedMentors = []) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/rebalance-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cohorts, removed_mentor: removedMentorName , excluded_mentors: excludedMentors })
    });
  } catch (networkErr) {
    return { ok: false, error: `Could not connect to ${API_BASE} to remove mentor "${removedMentorName}".` };
  }

  const data = await parseJsonResponse(response).catch(err => ({ error: err.message }));
  if (!response.ok || data.error) {
    return { ok: false, error: data.error || 'Unknown error' };
  }
  return { ok: true, data: normalizeCohorts(data) };
}
