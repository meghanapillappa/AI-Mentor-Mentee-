// ---------------------------------------------------------------------------
// utils.js
//
// Small, generic helpers with no feature-specific logic in them. Safe to
// depend on from any other module. Add pure helper functions here rather
// than duplicating one-off logic in a feature module.
// ---------------------------------------------------------------------------

function getField(row, candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== '') return row[c];
  }
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') return row[found];
  }
  return undefined;
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.className = 'status-line' + (kind ? ' ' + kind : '');
}

function verifyMatchReady() {
  matchBtn.disabled = !(mentorsData.length > 0 && studentsData.length > 0);
}

export function extractExcludedMentors(mentorsData) {
  return mentorsData
    .filter(row => row._excluded)
    .map(row => getMentorName(row) ?? Object.values(row).find(v => v !== undefined && v !== null && v !== ''))
    .filter(Boolean);
}
