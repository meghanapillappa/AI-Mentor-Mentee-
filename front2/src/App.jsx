import { useEffect, useMemo, useState } from 'react';
import { useMentorEngine } from './hooks/useMentorEngine';
import { filterCohorts } from './lib/filterCohorts';
import Sidebar from './components/Sidebar';
import DatasetEditor from './components/DatasetEditor';
import ReallocationBanner from './components/ReallocationBanner';
import MacroMetrics from './components/MacroMetrics';
import SearchFilterBar, { DEFAULT_FILTERS } from './components/SearchFilterBar';
import CohortsGrid from './components/CohortsGrid';
import { extractExcludedMentors } from './lib/utils';
import RemovalDecisionModal from './components/RemovalDecisionModal';
import NewCredentialsModal from './components/NewCredentialsModal';

import { useAuth } from './hooks/useAuth';
import LoginPage from './components/LoginPage';
import MenteeHome from './components/MenteeHome';
import MentorHome from './components/MentorHome';
import ViewerHome from './components/ViewerHome';
import WorkspaceSelector from './components/WorkspaceSelector';
import { apiGetMyCohort } from './lib/api';
import DeadlinesPage from './components/DeadlinesPage';

export default function App() {
  const auth = useAuth();

  const engine = useMentorEngine();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const { lastCohorts } = engine;
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [view, setView] = useState('main');

  // Mentor-only: fetch just this mentor's own cohort from the backend
  // (/api/my-cohort), independent of the admin's local `lastCohorts` state
  // — a mentor logs in from their own session and never runs a match
  // themselves, so this is the only way they see real data.
  const [mentorCohort, setMentorCohort] = useState(null);
  const [mentorCohortError, setMentorCohortError] = useState('');

  useEffect(() => {
    if (!auth.isAuthenticated || auth.isAdmin || auth.session?.role !== 'mentor') return;
    let cancelled = false;
    (async () => {
      const result = await apiGetMyCohort();
      if (cancelled) return;
      if (result.ok) {
        setMentorCohort(result.cohort);
      } else {
        setMentorCohortError(result.error);
      }
    })();
    return () => { cancelled = true; };
  }, [auth.isAuthenticated, auth.isAdmin, auth.session?.role]);

  // Mentor/section select options + view-limit slider bounds, ported from
  // filters.js populateFilterOptions().
  const mentorOptions = useMemo(() => lastCohorts.map(c => c.mentor), [lastCohorts]);
  const reassignableMentorOptions = useMemo(() => {
  const excluded = new Set(extractExcludedMentors(engine.mentorsData));
  return mentorOptions.filter(m => !excluded.has(m));
  }, [mentorOptions, engine.mentorsData]);

  const sectionOptions = useMemo(() => {
    const sections = new Set();
    lastCohorts.forEach(c => c.students.forEach(s => sections.add(s.Section)));
    return Array.from(sections).sort();
  }, [lastCohorts]);

  const maxCohortSize = useMemo(
    () => Math.max(1, ...lastCohorts.map(c => c.student_count), 1),
    [lastCohorts]
  );

  // Reset the view-limit default to fit the new results, but only if the
  // user hasn't turned the limit on themselves (mirrors the original's
  // `if (!viewLimitEnabled.checked) { ... }` guard).
  useEffect(() => {
    if (lastCohorts.length === 0) return;
    setFilters(prev => (prev.viewLimitEnabled ? prev : { ...prev, viewLimitValue: Math.min(10, maxCohortSize) }));
  }, [lastCohorts, maxCohortSize]);

  const { cards, totalMatchedStudents } = useMemo(
    () => filterCohorts(lastCohorts, filters),
    [lastCohorts, filters]
  );

  const resultLabel = `${cards.length} mentor cohort(s) \u00b7 ${totalMatchedStudents} student(s) matched`;

  if (!auth.isAuthenticated) {
    return <LoginPage onLogin={auth.login} error={auth.loginError} loading={auth.loggingIn} />;
  }
  if (!auth.isAdmin) {
    if (auth.session.role === 'mentor') {
      return (
        <MentorHome
          username={auth.session.username}
          cohort={mentorCohort}
          cohortError={mentorCohortError}
          onLogout={auth.logout}
        />
      );
    }

    if (auth.session.role === 'viewer') {
      return <ViewerHome username={auth.session.username} onLogout={auth.logout} />;
    }

    // Mentee accounts: fetch and display their own profile, mentor, and sessions.
    return <MenteeHome username={auth.session.username} onLogout={auth.logout} />;
  }

  if (view === 'deadlines') {
    return (
       <DeadlinesPage
       activeWorkspace={activeWorkspace}
       setActiveWorkspace={setActiveWorkspace}
        onBack={() => setView('main')}
      />
    );
  }

  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Mentor Distribution Engine</h1>
          <p>Proportional-fair stratification algorithm based on grade boundaries, sections, and global average GPA.</p>
        </div>
        <button className="ghost-btn" onClick={auth.logout}>Log out</button>

        <button className="ghost-btn" onClick={() => setView('deadlines')}>
           Manage Deadlines
        </button>
      </header>

      <div className="control-grid">
        <Sidebar engine={engine}
        activeWorkspace={activeWorkspace}
        setActiveWorkspace={setActiveWorkspace}
        />

        <main>
          <DatasetEditor
            keyName="mentors"
            title="Mentors"
            data={engine.mentorsData}
            onChangeCell={(rIdx, col, value) => {
              const rows = [...engine.mentorsData];
              rows[rIdx] = { ...rows[rIdx], [col]: value };
              engine.setMentorsData(rows);
            }}
            onRemoveRow={(rIdx) => {
              engine.setMentorsData(engine.mentorsData.filter((_, i) => i !== rIdx));
            }}
            onAddRow={() => engine.addBlankRow('mentors')}
            onSave={(format) => engine.saveDataset(engine.mentorsData, format, 'mentors')}
            onToggleExclude={(rIdx) => engine.toggleMentorExcluded(rIdx)}

          />

          <DatasetEditor
            keyName="students"
            title="Mentees"
            data={engine.studentsData}
            onChangeCell={(rIdx, col, value) => {
              const rows = [...engine.studentsData];
              rows[rIdx] = { ...rows[rIdx], [col]: value };
              engine.setStudentsData(rows);
            }}
            onRemoveRow={(rIdx) => {
              engine.setStudentsData(engine.studentsData.filter((_, i) => i !== rIdx));
            }}
            onAddRow={() => engine.addBlankRow('students')}
            onSave={(format) => engine.saveDataset(engine.studentsData, format, 'students')}
          />

          {engine.reallocationVisible && (
            <ReallocationBanner
              report={engine.lastReallocation}
              onClose={() => engine.setReallocationVisible(false)}
              mentorOptions={reassignableMentorOptions}
              onReassign={engine.reassignReallocationGroup}
            />
          )}

          {lastCohorts.length > 0 && <MacroMetrics cohorts={lastCohorts} />}

          {lastCohorts.length > 0 && (
            <SearchFilterBar
              filters={filters}
              setFilters={setFilters}
              mentorOptions={mentorOptions}
              sectionOptions={sectionOptions}
              maxCohortSize={maxCohortSize}
              resultLabel={resultLabel}
              hasReallocation={Boolean(engine.lastReallocation)}
              onToggleRealloc={() => engine.setReallocationVisible(v => !v)}
            />
          )}

          <CohortsGrid
            matching={engine.matching}
            matchError={engine.matchError}
            cards={cards}
            hasRun={engine.hasRun}
          />

          <RemovalDecisionModal pending={engine.pendingRemoval} onResolve={engine.resolvePendingRemoval} />
          <NewCredentialsModal result={engine.newCredentials} onClose={() => engine.setNewCredentials(null)} />
        </main>
      </div>
    </div>
  );
}
