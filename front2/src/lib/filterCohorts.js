// ---------------------------------------------------------------------------
// filterCohorts.js
//
// Pure function version of the DOM-mutating renderCohorts() from the
// original filters.js. Given cohorts + the current filter state, returns
// exactly which cards to render and with which students visible/truncated.
// ---------------------------------------------------------------------------

export function filterCohorts(cohorts, filters) {
  const searchTerm = filters.search.trim().toLowerCase();
  const cgpaMinVal = filters.cgpaMin !== '' ? parseFloat(filters.cgpaMin) : null;
  const cgpaMaxVal = filters.cgpaMax !== '' ? parseFloat(filters.cgpaMax) : null;
  const cgpaFilterActive = cgpaMinVal !== null || cgpaMaxVal !== null;

  const viewLimitActive = filters.viewLimitEnabled;
  const viewLimitCount = viewLimitActive ? Math.max(1, parseInt(filters.viewLimitValue, 10) || 1) : null;

  const anyStudentFilterActive = Boolean(filters.grade || filters.section || searchTerm || cgpaFilterActive);

  const cards = [];
  let totalMatchedStudents = 0;

  cohorts.forEach(cohort => {
    if (filters.mentor && cohort.mentor !== filters.mentor) return;

    const mentorNameMatches = Boolean(searchTerm) && cohort.mentor.toLowerCase().includes(searchTerm);

    const visibleStudents = cohort.students.filter(s => {
      if (filters.grade && s.Grade !== filters.grade) return false;
      if (filters.section && s.Section !== filters.section) return false;
      if (cgpaMinVal !== null && s.CGPA < cgpaMinVal) return false;
      if (cgpaMaxVal !== null && s.CGPA > cgpaMaxVal) return false;
      return true;
    });

    let studentsToRender = visibleStudents;
    if (searchTerm && !mentorNameMatches) {
      studentsToRender = visibleStudents.filter(s => s.name.toLowerCase().includes(searchTerm));
      if (studentsToRender.length === 0) return; // no match in this cohort at all
    } else if (searchTerm && mentorNameMatches) {
      // mentor matched by name: show all of that mentor's (filtered) students
      studentsToRender = visibleStudents;
    }

    if (
      studentsToRender.length === 0 &&
      !(filters.mentor === cohort.mentor && visibleStudents.length === 0 && !filters.grade && !filters.section && !cgpaFilterActive)
    ) {
      if (anyStudentFilterActive) return;
    }

    totalMatchedStudents += studentsToRender.length;

    const totalAfterFilters = studentsToRender.length;
    const isTruncated = viewLimitActive && totalAfterFilters > viewLimitCount;
    const renderedSlice = isTruncated ? studentsToRender.slice(0, viewLimitCount) : studentsToRender;

    cards.push({
      cohort,
      mentorNameMatches,
      renderedSlice,
      totalAfterFilters,
      isTruncated,
      viewLimitCount,
      searchTerm,
      anyStudentFilterActive,
    });
  });

  return { cards, totalMatchedStudents };
}
