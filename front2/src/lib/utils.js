// ---------------------------------------------------------------------------
// utils.js
//
// Small, generic helpers with no feature-specific logic in them. Ported
// 1:1 from the original vanilla-JS utils.js / state.js.
// ---------------------------------------------------------------------------

export function getField(row, candidates) {
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

export function stripInternalFields(rows) {
  return rows.map(row => {
    const clean = {};
    Object.keys(row).forEach(k => { if (!k.startsWith('_')) clean[k] = row[k]; });
    return clean;
  });
}

export function getMentorName(row) {
  return getField(row, ['Name', 'name', 'Mentor', 'mentor']);
}

export function buildMentorNameMap(data) {
  const map = new Map();
  data.forEach(row => {
    const name = getMentorName(row);
    if (row._uid && name) map.set(row._uid, String(name));
  });
  return map;
}

export function extractMentorsList(mentorsData) {
  return mentorsData
    .map(row => getMentorName(row) ?? Object.values(row).find(v => v !== undefined && v !== null && v !== ''))
    .filter(Boolean);
}

export function extractStudentsList(studentsData) {
  return studentsData
    .map(row => {
      const name = getField(row, ['Name', 'name']);
      const cgpaRaw = getField(row, ['CGPA', 'cgpa', 'GPA', 'gpa']);
      const section = getField(row, ['Section', 'section']);
      return {
        name,
        CGPA: parseFloat(cgpaRaw),
        Section: (section || '').toString().trim().toUpperCase(),
        // Stable per-row id, carried through the backend untouched. Used to
        // track exactly which mentor a given student lands with after a
        // mentor is removed/added (see the reallocation report feature).
        uid: row._uid,
      };
    })
    .filter(s => s.name && !isNaN(s.CGPA));
}

export function extractExcludedMentors(mentorsData) {
  return mentorsData
    .filter(row => row._excluded)
    .map(row => getMentorName(row) ?? Object.values(row).find(v => v !== undefined && v !== null && v !== ''))
    .filter(Boolean);
}
