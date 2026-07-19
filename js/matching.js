// ---------------------------------------------------------------------------
// matching.js
//
// Feature: run the full balancing algorithm, display macro metrics, and
// keep the match in sync as mentors are added/removed/renamed afterwards
// (incremental rebalancing, without reshuffling everyone else).
//
// Depends on: state.js, api.js, datasetEditor.js (extractMentorsList/
// extractStudentsList), reallocationReport.js (buildReallocationReport).
// Calls populateFilterOptions() / renderCohorts() (defined in filters.js)
// once results are ready.
// ---------------------------------------------------------------------------

matchBtn.addEventListener('click', async () => {
  resultsDiv.innerHTML = "<p class='empty-note'>Running stratified balancing algorithm...</p>";
  searchFilterBar.style.display = 'none';

  // A fresh full run establishes a new baseline; any prior reallocation
  // report no longer reflects the current mapping.
  lastReallocation = null;
  reallocationBanner.style.display = 'none';
  reallocToggleBtn.style.display = 'none';

  const mentors = extractMentorsList();
  const students = extractStudentsList();

  try {
    const cohorts = await apiRunMatch(students, mentors);

    if (!Array.isArray(cohorts) || cohorts.length === 0) {
      resultsDiv.innerHTML = "<p class='empty-note'>No matches were produced. Check your uploaded data.</p>";
      macroMetricsDiv.style.display = 'none';
      return;
    }

    lastCohorts = cohorts;
    // Baseline snapshot: after a full run, this is the "current truth" for
    // which mentor each row maps to. Future mentor-table edits are diffed
    // against this to detect adds/removes/renames.
    mentorSnapshot = buildMentorNameMap(mentorsData);

    updateMacroMetrics(cohorts);

    populateFilterOptions(cohorts);
    searchFilterBar.style.display = 'flex';

    renderCohorts(cohorts);
  } catch (err) {
    resultsDiv.innerHTML = `<p style="color: var(--semantic-amber); font-size: 14px;">Connection error: ${err.message}. Ensure app.py backend framework is running natively.</p>`;
    macroMetricsDiv.style.display = 'none';
  }
});

function updateMacroMetrics(cohorts) {
  const totalStudents = cohorts.reduce((sum, c) => sum + c.student_count, 0);
  const allAverages = cohorts.map(c => c.average_gpa);
  const globalAvg = allAverages.reduce((a, b) => a + b, 0) / allAverages.length;
  const maxAvg = Math.max(...allAverages);
  const minAvg = Math.min(...allAverages);
  const spreadVariance = maxAvg - minAvg;

  document.getElementById('metric-students').textContent = totalStudents;
  document.getElementById('metric-mentors').textContent = cohorts.length;
  document.getElementById('metric-gpa').textContent = globalAvg.toFixed(3);
  document.getElementById('metric-variance').textContent = `± ${spreadVariance.toFixed(3)}`;
  macroMetricsDiv.style.display = 'grid';
}

// ---------------------------------------------------------------------------
// Incremental mentor rebalancing (feature: add/remove mentors after a match
// without reshuffling everyone else)
// ---------------------------------------------------------------------------

async function applyMentorAddition(newMentorName) {
  const result = await apiRebalanceAdd(lastCohorts, newMentorName);
  if (!result.ok) {
    alert(`Could not add mentor "${newMentorName}": ${result.error}`);
    return false;
  }
  lastCohorts = result.data;
  return true;
}

async function applyMentorRemoval(removedMentorName) {
  const result = await apiRebalanceRemove(lastCohorts, removedMentorName);
  if (!result.ok) {
    alert(`Could not remove mentor "${removedMentorName}": ${result.error}`);
    return false;
  }
  lastCohorts = result.data;
  return true;
}

async function syncMentorChanges() {
  if (!lastCohorts.length) return; // no match yet; full "Execute Balancing" run will establish the baseline

  const currentMap = buildMentorNameMap(mentorsData);

  // 1. Renames: same row (uid), different name -> just relabel, no rebalancing needed.
  for (const [uid, name] of currentMap.entries()) {
    if (mentorSnapshot.has(uid) && mentorSnapshot.get(uid) !== name) {
      const oldName = mentorSnapshot.get(uid);
      const cohort = lastCohorts.find(c => c.mentor === oldName);
      if (cohort) cohort.mentor = name;
      mentorSnapshot.set(uid, name);
    }
  }

  // 2. Removed mentors: redistribute only their students among the rest.
  const removedUids = [...mentorSnapshot.keys()].filter(uid => !currentMap.has(uid));
  for (const uid of removedUids) {
    const removedName = mentorSnapshot.get(uid);
    // Snapshot exactly who this mentor had *before* we call the backend,
    // so we can diff against the result and see where each one landed.
    const cohortBefore = lastCohorts.find(c => c.mentor === removedName);
    const orphanedStudents = cohortBefore ? [...cohortBefore.students] : [];

    const ok = await applyMentorRemoval(removedName);
    if (ok) {
      mentorSnapshot.delete(uid);
      buildReallocationReport(removedName, orphanedStudents, lastCohorts);
    }
  }

  // 3. Added mentors: pull a small, balanced slice from each existing mentor.
  const addedUids = [...currentMap.keys()].filter(uid => !mentorSnapshot.has(uid));
  for (const uid of addedUids) {
    const newName = currentMap.get(uid);
    const ok = await applyMentorAddition(newName);
    if (ok) mentorSnapshot.set(uid, newName);
  }

  updateMacroMetrics(lastCohorts);
  populateFilterOptions(lastCohorts);
  renderCohorts(lastCohorts);
}
