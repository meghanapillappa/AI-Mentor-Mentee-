// ---------------------------------------------------------------------------
// reallocationReport.js
//
// Feature 1: after a mentor is deleted from the mentors table, show exactly
// which mentees moved and which new mentor picked each one up.
//
// Public entry point: buildReallocationReport(removedMentorName,
// orphanedStudents, updatedCohorts) — called from matching.js right after a
// mentor-removal rebalance succeeds.
//
// Depends on: state.js (reallocationBanner, reallocSummaryEl, reallocBodyEl,
// reallocCloseBtn, reallocToggleBtn, lastReallocation).
// ---------------------------------------------------------------------------

function buildReallocationReport(removedMentorName, orphanedStudents, updatedCohorts) {
  // Map each student's stable uid -> the mentor they ended up with, by
  // scanning the freshly-returned cohorts.
  const uidToNewMentor = new Map();
  updatedCohorts.forEach(c => {
    c.students.forEach(s => {
      if (s.uid !== undefined && s.uid !== null) uidToNewMentor.set(s.uid, c.mentor);
    });
  });

  const moves = orphanedStudents.map(s => ({
    student: s,
    toMentor: uidToNewMentor.get(s.uid) || 'Unresolved'
  }));

  lastReallocation = { removedMentor: removedMentorName, moves };
  renderReallocationReport(lastReallocation);
  reallocationBanner.style.display = 'block';
  reallocToggleBtn.style.display = 'inline-block';
}

function renderReallocationReport(report) {
  if (!report) return;
  const { removedMentor, moves } = report;

  reallocSummaryEl.textContent =
    `Mentor "${removedMentor}" removed \u2014 ${moves.length} mentee(s) redistributed`;

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
