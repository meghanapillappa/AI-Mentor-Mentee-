import { useCallback, useEffect, useRef, useState } from 'react';
import { apiParseFile, apiRebalanceAdd, apiRebalanceRemove, apiRunMatch, apiSaveFile } from '../lib/api';
import { buildMentorNameMap, extractMentorsList, extractStudentsList, stripInternalFields,extractExcludedMentors } from '../lib/utils';
import { buildAuditEvent } from '../lib/auditLog';

const EMPTY_STATUS = { text: '', kind: '' };

/**
 * All shared app state + logic, ported from state.js / datasetEditor.js /
 * matching.js / reallocationReport.js. Kept as one hook (rather than React
 * Context) since this is a single-page tool with one consumer (App).
 */
export function useMentorEngine() {
  const [mentorsData, setMentorsData] = useState([]);
  const [studentsData, setStudentsData] = useState([]);
  const [lastCohorts, setLastCohorts] = useState([]);
  const [lastReallocation, setLastReallocation] = useState(null);
  const [reallocationVisible, setReallocationVisible] = useState(false);

  // Feature: when a mentor with mentees is removed, ask the user whether to
  // auto-balance those mentees across everyone else, or send ALL of them
  // directly to one chosen mentor instead.
  const [pendingRemoval, setPendingRemoval] = useState(null); // { removedName, orphanedStudents, mentorOptions }
  const pendingRemovalResolverRef = useRef(null);

  const requestRemovalDecision = useCallback((removedName, orphanedStudents, mentorOptions) => {
    return new Promise(resolve => {
      pendingRemovalResolverRef.current = resolve;
      setPendingRemoval({ removedName, orphanedStudents, mentorOptions });
    });
  }, []);

  const resolvePendingRemoval = useCallback((decision) => {
    pendingRemovalResolverRef.current?.(decision);
    pendingRemovalResolverRef.current = null;
    setPendingRemoval(null);
  }, []);

  // Audit log state (feature: persistent history of every mentor add/remove,
  // with exactly which mentees moved and where — see components/AuditLog.jsx)
  const [auditLogEntries, setAuditLogEntries] = useState([]);
  const auditLogCounterRef = useRef(0);

  const [combinedStatus, setCombinedStatus] = useState(EMPTY_STATUS);
  const [mentorsStatus, setMentorsStatus] = useState(EMPTY_STATUS);
  const [studentsStatus, setStudentsStatus] = useState(EMPTY_STATUS);

  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [hasRun, setHasRun] = useState(false);

  // Maps a stable per-row uid -> mentor name, as reflected in lastCohorts.
  // Used to detect adds/removes/renames in the mentors table after a match
  // has already run, so we can rebalance incrementally instead of from scratch.
  const mentorSnapshotRef = useRef(new Map());
  const uidCounterRef = useRef(0);

  const assignUids = useCallback((rows) => {
    rows.forEach(r => { if (!r._uid) r._uid = 'u' + (uidCounterRef.current++); });
    return rows;
  }, []);

  const matchReady = mentorsData.length > 0 && studentsData.length > 0;

  // -------------------------------------------------------------------------
  // File uploads
  // -------------------------------------------------------------------------

  const handleMentorsFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const data = await apiParseFile(file);
      const rows = assignUids(data.mentors);
      setMentorsData(rows);
      setMentorsStatus({ text: `Loaded ${rows.length} mentors`, kind: 'ok' });
    } catch (err) {
      setMentorsStatus({ text: err.message, kind: 'err' });
    }
  }, [assignUids]);

  const handleStudentsFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const data = await apiParseFile(file);
      const rows = assignUids(data.mentees);
      setStudentsData(rows);
      const text = data.mentees_normalized
        ? `Loaded ${rows.length} student rows from ${file.name} (columns auto-mapped to Student ID / Name / Section / CGPA)`
        : `Loaded ${rows.length} student rows from ${file.name}`;
      setStudentsStatus({ text, kind: 'ok' });
    } catch (err) {
      setStudentsStatus({ text: `Error: ${err.message}`, kind: 'err' });
    }
  }, [assignUids]);

  const handleCombinedFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const data = await apiParseFile(file);

      if (data.mentors?.length) {
        const rows = assignUids(data.mentors);
        setMentorsData(rows);
        setMentorsStatus({ text: `Loaded ${rows.length} mentors`, kind: 'ok' });
      }
      if (data.mentees?.length) {
        const rows = assignUids(data.mentees);
        setStudentsData(rows);
        const text = data.mentees_normalized
          ? `Loaded ${rows.length} mentees (columns auto-mapped to Student ID / Name / Section / CGPA)`
          : `Loaded ${rows.length} mentees`;
        setStudentsStatus({ text, kind: 'ok' });
      }

      setCombinedStatus({ text: 'Combined dataset loaded successfully.', kind: 'ok' });
    } catch (err) {
      setCombinedStatus({ text: err.message, kind: 'err' });
    }
  }, [assignUids]);

  // -------------------------------------------------------------------------
  // Editable tables
  // -------------------------------------------------------------------------

  const addBlankRow = useCallback((key) => {
    const setter = key === 'mentors' ? setMentorsData : setStudentsData;
    setter(prev => {
      const columns = [];
      prev.forEach(row => Object.keys(row).forEach(k => { if (!k.startsWith('_') && !columns.includes(k)) columns.push(k); }));
      const blankRow = {};
      columns.forEach(col => { blankRow[col] = ''; });
      blankRow._uid = 'u' + (uidCounterRef.current++);
      return [...prev, blankRow];
    });
  }, []);

  const toggleMentorExcluded = useCallback((rIdx) => {
  setMentorsData(prev => {
    const rows = [...prev];
    rows[rIdx] = { ...rows[rIdx], _excluded: !rows[rIdx]._excluded };
    return rows;
  });
  }, []);

  const saveDataset = useCallback(async (rows, format, filenameBase) => {
    try {
      const response = await apiSaveFile(stripInternalFields(rows), format, filenameBase);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameBase}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Reallocation report (feature: mentor-removal report)
  // -------------------------------------------------------------------------

  const buildReallocationReport = useCallback((removedMentorName, orphanedStudents, updatedCohorts) => {
    const uidToNewMentor = new Map();
    updatedCohorts.forEach(c => {
      c.students.forEach(s => {
        if (s.uid !== undefined && s.uid !== null) uidToNewMentor.set(s.uid, c.mentor);
      });
    });

    const moves = orphanedStudents.map(s => ({
      student: s,
      toMentor: uidToNewMentor.get(s.uid) || 'Unresolved',
    }));

    setLastReallocation({ removedMentor: removedMentorName, moves });
    setReallocationVisible(true);
  }, []);

  const reassignReallocationGroup = useCallback((students, fromMentor, toMentor) => {
    if (!toMentor || toMentor === fromMentor) return;
    const movingUids = new Set(students.map(s => s.uid));

    setLastCohorts(prev => {
      const next = prev.map(c => ({ ...c, students: [...c.students] }));
      const fromCohort = next.find(c => c.mentor === fromMentor);
      const toCohort = next.find(c => c.mentor === toMentor);
      if (!fromCohort || !toCohort) return prev;

      const moving = fromCohort.students.filter(s => movingUids.has(s.uid));
      fromCohort.students = fromCohort.students.filter(s => !movingUids.has(s.uid));
      toCohort.students = [...toCohort.students, ...moving];

      [fromCohort, toCohort].forEach(c => {
        c.student_count = c.students.length;
        c.average_gpa = c.students.length
          ? Number((c.students.reduce((sum, s) => sum + s.CGPA, 0) / c.students.length).toFixed(3))
          : 0;
      });

      return next;
    });

    setLastReallocation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        moves: prev.moves.map(m => (movingUids.has(m.student.uid) ? { ...m, toMentor } : m)),
      };
    });
  }, []);

  // -------------------------------------------------------------------------
  // Audit log (feature: persistent history of every mentor add/remove)
  // -------------------------------------------------------------------------

  const recordAuditEvent = useCallback((type, data) => {
    const event = buildAuditEvent(type, data, auditLogCounterRef.current++);
    setAuditLogEntries(prev => [event, ...prev]); // most recent first
  }, []);

  // -------------------------------------------------------------------------
  // Matching
  // -------------------------------------------------------------------------

  const runMatch = useCallback(async () => {
    setMatching(true);
    setHasRun(true);
    setMatchError('');
    setLastReallocation(null);
    setReallocationVisible(false);
    setLastCohorts([]); // clear stale results so metrics/filter bar hide while running

    const mentors = extractMentorsList(mentorsData);
    const students = extractStudentsList(studentsData);
    const excludedMentors = extractExcludedMentors(mentorsData);

    try {
    const cohorts = await apiRunMatch(students, mentors, excludedMentors);

      if (!Array.isArray(cohorts) || cohorts.length === 0) {
        setMatchError('No matches were produced. Check your uploaded data.');
        return;
      }

      setLastCohorts(cohorts);
      // Baseline snapshot: after a full run, this is the "current truth" for
      // which mentor each row maps to. Future mentor-table edits are diffed
      // against this to detect adds/removes/renames.
      mentorSnapshotRef.current = buildMentorNameMap(mentorsData);
    } catch (err) {
      setMatchError(err.message);
    } finally {
      setMatching(false);
    }
  }, [mentorsData, studentsData]);

  // -------------------------------------------------------------------------
  // Incremental mentor rebalancing (feature: add/remove mentors after a
  // match without reshuffling everyone else)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (lastCohorts.length === 0) return undefined;
    const excludedMentors = extractExcludedMentors(mentorsData);
    const excludedNames = new Set(excludedMentors);

    let cancelled = false;

    (async () => {
      let cohorts = lastCohorts;
      const currentMap = buildMentorNameMap(mentorsData);
      const snapshot = mentorSnapshotRef.current;

      // 1. Renames: same row (uid), different name -> just relabel, no rebalancing needed.
      for (const [uid, name] of currentMap.entries()) {
        if (snapshot.has(uid) && snapshot.get(uid) !== name) {
          const oldName = snapshot.get(uid);
          cohorts = cohorts.map(c => (c.mentor === oldName ? { ...c, mentor: name } : c));
          snapshot.set(uid, name);
        }
      }

      // 2. Removed mentors: ask how to redistribute their students, then
      // either auto-balance (backend) or send them all to one mentor (local).
      const removedUids = [...snapshot.keys()].filter(uid => !currentMap.has(uid));
      for (const uid of removedUids) {
        const removedName = snapshot.get(uid);
        const cohortBefore = cohorts.find(c => c.mentor === removedName);
        const orphanedStudents = cohortBefore ? [...cohortBefore.students] : [];

        const mentorOptionsForDecision = cohorts
          .map(c => c.mentor)
          .filter(m => m !== removedName && !excludedNames.has(m));

        let decision = { mode: 'auto' };
        if (orphanedStudents.length > 0 && mentorOptionsForDecision.length > 0) {
          decision = await requestRemovalDecision(removedName, orphanedStudents, mentorOptionsForDecision);
        }

        if (decision.mode === 'direct' && decision.targetMentor) {
          // Send ALL of the removed mentor's mentees straight to one chosen
          // mentor — no balancing algorithm involved.
          const next = cohorts
            .filter(c => c.mentor !== removedName)
            .map(c => ({ ...c, students: [...c.students] }));
          const target = next.find(c => c.mentor === decision.targetMentor);
          target.students = [...target.students, ...orphanedStudents];
          target.student_count = target.students.length;
          target.average_gpa = target.students.length
            ? Number((target.students.reduce((sum, s) => sum + s.CGPA, 0) / target.students.length).toFixed(3))
            : 0;

          cohorts = next;
          snapshot.delete(uid);
          if (!cancelled) {
            buildReallocationReport(removedName, orphanedStudents, cohorts);
            recordAuditEvent('remove', {
              removed_mentor: removedName,
              students_reassigned: orphanedStudents.length,
              redistribution: [{
                mentor: decision.targetMentor,
                students_received: orphanedStudents.length,
                students: orphanedStudents,
              }],
            });
          }
          continue;
        }

        // Auto-balance path (unchanged from before).
        const result = await apiRebalanceRemove(cohorts, removedName, excludedMentors);
        if (!result.ok) {
          alert(`Could not remove mentor "${removedName}": ${result.error}`);
          continue;
        }
        cohorts = result.data.cohorts;
        snapshot.delete(uid);
        if (!cancelled) {
          buildReallocationReport(removedName, orphanedStudents, cohorts);
          recordAuditEvent('remove', result.data);
        }
      }

      // 3. Added mentors: pull a small, balanced slice from each existing mentor.
      const addedUids = [...currentMap.keys()].filter(uid => !snapshot.has(uid));
      for (const uid of addedUids) {
        const newName = currentMap.get(uid);
        if (excludedNames.has(newName)) {
          cohorts = [...cohorts, { mentor: newName, average_gpa: 0, student_count: 0, students: [] }];
          snapshot.set(uid, newName);
          continue;
        }
        const result = await apiRebalanceAdd(cohorts, newName);
        if (!result.ok) {
          alert(`Could not add mentor "${newName}": ${result.error}`);
          continue;
        }
        // result.data is { cohorts, new_mentor, students_pulled, sources } —
        // `sources` feeds the audit log.
        cohorts = result.data.cohorts;
        snapshot.set(uid, newName);
        if (!cancelled) recordAuditEvent('add', result.data);
      }

      if (!cancelled) setLastCohorts(cohorts);
    })();

    return () => { cancelled = true; };
    // Intentionally depends only on mentorsData: this effect exists purely to
    // react to mentor-table edits (rename/add/remove) once a match exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorsData]);

  return {
    // data
    mentorsData,
    studentsData,
    lastCohorts,
    lastReallocation,
    reallocationVisible,
    auditLogEntries,
    matchReady,
    matching,
    matchError,
    hasRun,
    combinedStatus,
    mentorsStatus,
    studentsStatus,
    pendingRemoval,
    // actions
    handleMentorsFile,
    handleStudentsFile,
    handleCombinedFile,
    setMentorsData,
    setStudentsData,
    addBlankRow,
    saveDataset,
    runMatch,
    setReallocationVisible,
    toggleMentorExcluded,
    reassignReallocationGroup,
    resolvePendingRemoval,
  };
}
