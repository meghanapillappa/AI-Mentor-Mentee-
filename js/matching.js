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
//
// Note: syncMentorChanges() below is invoked exclusively through
// queueMentorSync() (state.js), which serializes calls so that rapid mentor
// edits can't run concurrently and race each other's reads/writes of
// lastCohorts / mentorSnapshot.
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
    console.error(`Rebalance-add failed for mentor "${newMentorName}":`, result.error);
    alert(`Could not add mentor "${newMentorName}": ${result.error}`);
    return false;
  }
  lastCohorts = result.data;
  return true;
}

async function applyMentorRemoval(removedMentorName, excludedMentors = []) {
  const result = await apiRebalanceRemove(lastCohorts, removedMentorName, excludedMentors);
  if (!result.ok) {
    // Surface this in the console too — the alert() is easy to miss/dismiss
    // without reading, and this is the #1 reason the reallocation banner
    // appears to silently "not show up" after removing a mentor.
    console.error(`Rebalance-remove failed for mentor "${removedMentorName}":`, result.error);
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
      const cohort = lastCohorts.find(c => normalizeName(c.mentor) === normalizeName(oldName));
      if (cohort) cohort.mentor = name;
      mentorSnapshot.set(uid, name);
    }
  }

  // 2. Removed mentors: instead of auto-splitting their mentees across
  // every remaining mentor, ask the user which single mentor should take
  // ALL of them (promptMentorChoice, in mentorReallocationPicker.js). We
  // then tell the backend to exclude every *other* mentor from this
  // rebalance, so it has nowhere to put the orphaned mentees except the
  // one the user picked. Collect every removal from this pass and build
  // ONE combined reallocation report at the end, instead of calling
  // buildReallocationReport() inside the loop — doing it per-iteration
  // meant that removing two+ mentors in the same pass would silently
  // overwrite the report from all but the last one.
  const removedUids = [...mentorSnapshot.keys()].filter(uid => !currentMap.has(uid));
  const removals = [];
  for (const uid of removedUids) {
    const removedName = mentorSnapshot.get(uid);
    // Snapshot exactly who this mentor had *before* we call the backend, so
    // we can diff against the result and see where each one landed. Compare
    // names with normalizeName() so a stray leading/trailing space (or a
    // name the backend echoes back slightly differently) doesn't cause this
    // lookup to silently miss and produce an empty report.
    const cohortBefore = lastCohorts.find(c => normalizeName(c.mentor) === normalizeName(removedName));
    const orphanedStudents = cohortBefore ? [...cohortBefore.students] : [];

    if (orphanedStudents.length === 0) {
      // Nothing to reassign — still let the backend drop the now-empty
      // cohort, but there's no mentor choice to make.
      const ok = await applyMentorRemoval(removedName);
      if (ok) mentorSnapshot.delete(uid);
      continue;
    }

    // Mentors currently able to receive mentees: every cohort except the
    // one being removed (and any removed earlier in this same pass, since
    // lastCohorts is updated in place as each removal is applied).
    const candidateMentors = lastCohorts
      .map(c => c.mentor)
      .filter(name => normalizeName(name) !== normalizeName(removedName));

    const chosenMentor = await promptMentorChoice(removedName, candidateMentors, orphanedStudents);
    if (!chosenMentor) {
      // User dismissed the picker. Leave this removal unresolved for now
      // rather than guessing — their row is gone from the table, but the
      // backend cohort is untouched until a choice is made (it'll be
      // re-prompted on the next edit that triggers a sync).
      continue;
    }

    const excludedMentors = candidateMentors.filter(name => normalizeName(name) !== normalizeName(chosenMentor));

    const ok = await applyMentorRemoval(removedName, excludedMentors);
    if (ok) {
      mentorSnapshot.delete(uid);
      removals.push({ mentor: removedName, students: orphanedStudents });
    }
  }
  if (removals.length) {
    buildReallocationReport(removals, lastCohorts);
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
