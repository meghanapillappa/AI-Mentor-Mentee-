// ---------------------------------------------------------------------------
// filters.js
//
// Feature: search + filter (mentor / grade / section / CGPA range) and the
// per-mentor "view limit" display control. Owns renderCohorts(), the single
// function that draws the cohort cards, so any change to how results look
// on screen belongs in this file.
//
// Depends on: state.js only. Called from matching.js after a match/rebalance.
// ---------------------------------------------------------------------------

function populateFilterOptions(cohorts) {
  const mentorNames = cohorts.map(c => c.mentor);
  const sections = new Set();
  cohorts.forEach(c => c.students.forEach(s => sections.add(s.Section)));

  filterMentor.innerHTML = '<option value="">All mentors</option>' +
    mentorNames.map(m => `<option value="${m}">${m}</option>`).join('');

  filterSection.innerHTML = '<option value="">All sections</option>' +
    Array.from(sections).sort().map(s => `<option value="${s}">Section ${s}</option>`).join('');

  // Size the view-limit slider/number to the largest cohort so the full
  // range is reachable, and default to a sensible starting point.
  const maxCohortSize = Math.max(1, ...cohorts.map(c => c.student_count));
  viewLimitSlider.max = maxCohortSize;
  const defaultLimit = Math.min(10, maxCohortSize);
  if (!viewLimitEnabled.checked) {
    viewLimitSlider.value = defaultLimit;
    viewLimitNumber.value = defaultLimit;
  }
  viewLimitNumber.max = maxCohortSize;
}

function renderCohorts(cohorts) {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const mentorFilterVal = filterMentor.value;
  const gradeFilterVal = filterGrade.value;
  const sectionFilterVal = filterSection.value;

  // Feature 2: CGPA range filter
  const cgpaMinVal = filterCgpaMin.value !== '' ? parseFloat(filterCgpaMin.value) : null;
  const cgpaMaxVal = filterCgpaMax.value !== '' ? parseFloat(filterCgpaMax.value) : null;
  const cgpaFilterActive = cgpaMinVal !== null || cgpaMaxVal !== null;

  // Feature 3: per-mentor display/view limit
  const viewLimitActive = viewLimitEnabled.checked;
  const viewLimitCount = viewLimitActive ? Math.max(1, parseInt(viewLimitNumber.value, 10) || 1) : null;

  const anyStudentFilterActive = gradeFilterVal || sectionFilterVal || searchTerm || cgpaFilterActive;

  resultsDiv.innerHTML = '';
  let totalMatchedStudents = 0;
  let cardsShown = 0;

  cohorts.forEach(cohort => {
    if (mentorFilterVal && cohort.mentor !== mentorFilterVal) return;

    const mentorNameMatches = searchTerm && cohort.mentor.toLowerCase().includes(searchTerm);

    // Apply student-level filters (grade/section/CGPA range/search)
    const visibleStudents = cohort.students.filter(s => {
      if (gradeFilterVal && s.Grade !== gradeFilterVal) return false;
      if (sectionFilterVal && s.Section !== sectionFilterVal) return false;
      if (cgpaMinVal !== null && s.CGPA < cgpaMinVal) return false;
      if (cgpaMaxVal !== null && s.CGPA > cgpaMaxVal) return false;
      return true;
    });

    // If searching, decide which students to show/highlight
    let studentsToRender = visibleStudents;
    if (searchTerm && !mentorNameMatches) {
      studentsToRender = visibleStudents.filter(s => s.name.toLowerCase().includes(searchTerm));
      if (studentsToRender.length === 0) return; // no match in this cohort at all
    } else if (searchTerm && mentorNameMatches) {
      // mentor matched by name: show all of that mentor's (filtered) students
      studentsToRender = visibleStudents;
    }

    if (studentsToRender.length === 0 && !(mentorFilterVal === cohort.mentor && visibleStudents.length === 0 && !gradeFilterVal && !sectionFilterVal && !cgpaFilterActive)) {
      if (anyStudentFilterActive) return;
    }

    totalMatchedStudents += studentsToRender.length;
    cardsShown += 1;

    // Apply the view/display limit last, purely for rendering — it doesn't
    // affect which cohorts qualify or the "Allocated" / "Matching" counts.
    const totalAfterFilters = studentsToRender.length;
    const isTruncated = viewLimitActive && totalAfterFilters > viewLimitCount;
    const renderedSlice = isTruncated ? studentsToRender.slice(0, viewLimitCount) : studentsToRender;

    const card = document.createElement('div');
    card.className = 'cohort-card';

    const tableRows = renderedSlice.map(s => {
      const isMatch = searchTerm && !mentorNameMatches && s.name.toLowerCase().includes(searchTerm);
      return `
        <tr class="${isMatch ? 'search-match' : ''}">
          <td><strong>${s.name}</strong></td>
          <td class="col-mono"><span class="grade-pill grade-${s.Grade.toLowerCase()}">${s.Grade}</span></td>
          <td class="col-mono">Section ${s.Section}</td>
          <td class="col-mono col-gpa">${s.CGPA.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const moreRow = isTruncated
      ? `<tr class="view-limit-more"><td colspan="4">⋯ ${totalAfterFilters - viewLimitCount} more mentee(s) not shown (view limit: ${viewLimitCount})</td></tr>`
      : '';

    card.innerHTML = `
      <div class="cohort-header">
        <div class="cohort-mentor">${cohort.mentor}${mentorNameMatches ? '<span class="mentor-match-badge">MATCH</span>' : ''}</div>
        <div class="cohort-summary-meta">
          Allocated: <strong>${cohort.student_count}</strong> &nbsp;|&nbsp; Avg: <span class="highlight-metric">${cohort.average_gpa.toFixed(3)}</span>
          ${anyStudentFilterActive ? `&nbsp;|&nbsp; Matching: <strong>${totalAfterFilters}</strong>` : ''}
          ${isTruncated ? `&nbsp;|&nbsp; Displaying: <strong>${viewLimitCount}</strong>` : ''}
        </div>
      </div>
      <div class="data-table-wrapper">
        <table class="roster-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Assigned Grade</th>
              <th>Section</th>
              <th style="text-align: right;">CGPA</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="4" class="empty-note">No students match the current filters.</td></tr>'}
            ${moreRow}
          </tbody>
        </table>
      </div>
    `;
    resultsDiv.appendChild(card);
  });

  if (cardsShown === 0) {
    resultsDiv.innerHTML = "<p class='empty-note'>No mentors or students match the current search/filter.</p>";
  }

  filterResultCount.textContent = `${cardsShown} mentor cohort(s) · ${totalMatchedStudents} student(s) matched`;
}

[searchInput, filterMentor, filterGrade, filterSection, filterCgpaMin, filterCgpaMax].forEach(el => {
  el.addEventListener('input', () => { if (lastCohorts.length) renderCohorts(lastCohorts); });
  el.addEventListener('change', () => { if (lastCohorts.length) renderCohorts(lastCohorts); });
});

// --- View limit: slider and number box stay in sync; checkbox enables both ---
viewLimitSlider.addEventListener('input', () => {
  viewLimitNumber.value = viewLimitSlider.value;
  if (lastCohorts.length) renderCohorts(lastCohorts);
});
viewLimitNumber.addEventListener('input', () => {
  if (viewLimitNumber.value !== '') viewLimitSlider.value = viewLimitNumber.value;
  if (lastCohorts.length) renderCohorts(lastCohorts);
});
viewLimitEnabled.addEventListener('change', () => {
  const on = viewLimitEnabled.checked;
  viewLimitSlider.disabled = !on;
  viewLimitNumber.disabled = !on;
  if (lastCohorts.length) renderCohorts(lastCohorts);
});

filterClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  filterMentor.value = '';
  filterGrade.value = '';
  filterSection.value = '';
  filterCgpaMin.value = '';
  filterCgpaMax.value = '';
  viewLimitEnabled.checked = false;
  viewLimitSlider.disabled = true;
  viewLimitNumber.disabled = true;
  if (lastCohorts.length) renderCohorts(lastCohorts);
});
