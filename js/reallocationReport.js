// ---------------------------------------------------------------------------
// reallocationReport.js
//
// Feature 1: after a mentor is deleted from the mentors table, show exactly
// which mentees moved and which new mentor picked each one up.
//
// Public entry point: buildReallocationReport(removals, updatedCohorts)
// — called from matching.js right after a batch of mentor-removal
// rebalances succeeds. `removals` is an array of
// { mentor: <removed mentor name>, students: <their students before removal> }
// — one entry per mentor removed in that sync pass, so removing several
// mentors at once still produces a single combined report rather than
// each removal clobbering the last.
//
// Depends on: state.js (reallocationBanner, reallocSummaryEl, reallocBodyEl,
// reallocCloseBtn, reallocToggleBtn, lastReallocation).
// ---------------------------------------------------------------------------

function buildReallocationReport(removals, updatedCohorts) {
  // Defensive: updatedCohorts should always be an array of cohort objects
  // (api.js normalizes the backend response to guarantee this), but if a
  // future backend change slips an unexpected shape through, fail soft here
  // rather than throwing — a thrown error inside the mentor-sync queue would
  // otherwise silently swallow the rest of the sync (see console for the
  // "Unexpected cohorts payload shape" warning logged in api.js).
  if (!Array.isArray(updatedCohorts)) {
    console.error('buildReallocationReport: expected an array of cohorts, got:', updatedCohorts);
    updatedCohorts = [];
  }

  // Map each student's stable uid -> the mentor they ended up with, by
  // scanning the freshly-returned cohorts.
  const uidToNewMentor = new Map();
  updatedCohorts.forEach(c => {
    c.students.forEach(s => {
      if (s.uid !== undefined && s.uid !== null) uidToNewMentor.set(s.uid, c.mentor);
    });
  });

  const moves = [];
  removals.forEach(({ mentor, students }) => {
    students.forEach(s => {
      moves.push({
        student: s,
        fromMentor: mentor,
        toMentor: uidToNewMentor.get(s.uid) || 'Unresolved'
      });
    });
  });

  lastReallocation = {
    removedMentors: removals.map(r => r.mentor),
    moves
  };
  renderReallocationReport(lastReallocation);
  reallocationBanner.style.display = 'block';
  reallocToggleBtn.style.display = 'inline-block';
}

function renderReallocationReport(report) {
  if (!report) return;
  const { removedMentors, moves } = report;

  const mentorLabel = removedMentors.length === 1
    ? `Mentor "${removedMentors[0]}"`
    : `Mentors ${removedMentors.map(m => `"${m}"`).join(', ')}`;

  reallocSummaryEl.textContent =
    `${mentorLabel} removed \u2014 ${moves.length} mentee(s) redistributed`;

  // Group moves by destination mentor
  const grouped = new Map();
  moves.forEach(m => {
    if (!grouped.has(m.toMentor)) grouped.set(m.toMentor, []);
    grouped.get(m.toMentor).push(m.student);
  });

  const groupsHtml = [...grouped.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([mentorName, students]) => `
      <div class="realloc-group">
        <div class="realloc-group-header">
          <span>→ ${mentorName}</span>
          <span class="count">${students.length} mentee${students.length === 1 ? '' : 's'}</span>
        </div>
        <div class="realloc-student-list">
          ${students.map(s => `<span class="realloc-student-chip">${s.name} (${s.CGPA.toFixed(2)})</span>`).join('')}
        </div>
      </div>
    `).join('');

  reallocBodyEl.innerHTML = groupsHtml || "<p class='empty-note'>No mentees needed to move.</p>";
}

reallocCloseBtn.addEventListener('click', () => {
  reallocationBanner.style.display = 'none';
});

reallocToggleBtn.addEventListener('click', () => {
  const isHidden = reallocationBanner.style.display === 'none';
  if (isHidden && lastReallocation) renderReallocationReport(lastReallocation);
  reallocationBanner.style.display = isHidden ? 'block' : 'none';
});
