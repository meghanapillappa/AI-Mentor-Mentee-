// ---------------------------------------------------------------------------
// state.js
//
// Single source of truth for shared app state + DOM element references.
// LOAD THIS SCRIPT FIRST — every other module reads these `const`/`let`
// bindings. They're declared at top level of a classic (non-module) script,
// so they live in the shared global scope and are visible to every script
// tag that loads after this one on the page.
//
// If you're adding a brand new piece of shared state or a new DOM control,
// declare it here so every module can see it.
// ---------------------------------------------------------------------------

const API_BASE = 'http://127.0.0.1:5001';

// --- Core dataset / match state ---
let mentorsData = [];   // array of row objects, as parsed/edited from file
let studentsData = [];  // array of row objects, as parsed/edited from file
let lastCohorts = [];   // raw results from the last /api/match call

// Maps a stable per-row uid -> mentor name, as reflected in lastCohorts.
// Used to detect adds/removes/renames in the mentors table after a match
// has already run, so we can rebalance incrementally instead of from scratch.
let mentorSnapshot = new Map();
let uidCounter = 0;

// Reallocation report state (feature: mentor-removal report)
let lastReallocation = null; // { removedMentors: [...], moves: [{student, fromMentor, toMentor}] }

// Serializes calls to syncMentorChanges(). The mentors table fires a change
// event per edit (add row, remove row, rename), and each handler kicks off
// syncMentorChanges() without awaiting it. If a user removes two mentor rows
// in quick succession, two overlapping calls would both read lastCohorts /
// mentorSnapshot before either had finished writing back — the second call's
// results (including its reallocation report) could silently clobber or race
// the first's. Routing every call through this queue guarantees they run one
// at a time, in order.
let _mentorSyncChain = Promise.resolve();
function queueMentorSync() {
  _mentorSyncChain = _mentorSyncChain
    .then(() => syncMentorChanges())
    .catch(err => console.error('syncMentorChanges failed:', err));
  return _mentorSyncChain;
}

function assignUids(rows) {
  rows.forEach(r => { if (!r._uid) r._uid = 'u' + (uidCounter++); });
  return rows;
}

function stripInternalFields(rows) {
  return rows.map(row => {
    const clean = {};
    Object.keys(row).forEach(k => { if (!k.startsWith('_')) clean[k] = row[k]; });
    return clean;
  });
}

function getMentorName(row) {
  return getField(row, ['Name', 'name', 'Mentor', 'mentor']);
}

function buildMentorNameMap(data) {
  const map = new Map();
  data.forEach(row => {
    const name = getMentorName(row);
    if (row._uid && name) map.set(row._uid, String(name));
  });
  return map;
}

// --- DOM references ---
const combinedFileInput = document.getElementById('combined-file');
const combinedStatus = document.getElementById('combined-status');
const mentorsFileInput = document.getElementById('mentors-file');
const studentsFileInput = document.getElementById('students-file');
const matchBtn = document.getElementById('match-btn');
const resultsDiv = document.getElementById('results');
const macroMetricsDiv = document.getElementById('macro-metrics');
const searchFilterBar = document.getElementById('search-filter-bar');

const mentorsEditorContainer = document.getElementById('mentors-editor-container');
const studentsEditorContainer = document.getElementById('students-editor-container');

const searchInput = document.getElementById('search-input');
const filterMentor = document.getElementById('filter-mentor');
const filterGrade = document.getElementById('filter-grade');
const filterSection = document.getElementById('filter-section');
const filterClearBtn = document.getElementById('filter-clear-btn');
const filterResultCount = document.getElementById('filter-result-count');

// Feature: CGPA range filter
const filterCgpaMin = document.getElementById('filter-cgpa-min');
const filterCgpaMax = document.getElementById('filter-cgpa-max');

// Feature: per-mentor view/display limit
const viewLimitEnabled = document.getElementById('view-limit-enabled');
const viewLimitSlider = document.getElementById('view-limit-slider');
const viewLimitNumber = document.getElementById('view-limit-number');

// Feature: mentor-removal reallocation report
const reallocationBanner = document.getElementById('reallocation-banner');
const reallocSummaryEl = document.getElementById('realloc-summary');
const reallocBodyEl = document.getElementById('realloc-body');
const reallocCloseBtn = document.getElementById('realloc-close-btn');
const reallocToggleBtn = document.getElementById('realloc-toggle-btn');
