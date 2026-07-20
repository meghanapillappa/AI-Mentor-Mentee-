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

export default function App() {
  const engine = useMentorEngine();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const { lastCohorts } = engine;

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

  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Mentor Distribution Engine</h1>
          <p>Proportional-fair stratification algorithm based on grade boundaries, sections, and global average GPA.</p>
        </div>
      </header>

      <div className="control-grid">
        <Sidebar engine={engine} />

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
        </main>
      </div>
    </div>
  );
}
