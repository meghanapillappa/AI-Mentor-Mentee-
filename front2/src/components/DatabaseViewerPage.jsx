import { useEffect, useMemo, useState } from 'react';
import { apiListCollections, apiListDocuments, apiGetDirectoryAsCohorts, apiGetMenteeSessionsAdmin } from '../lib/api';
import { filterCohorts } from '../lib/filterCohorts';
import WorkspaceSelector from './WorkspaceSelector';
import MacroMetrics from './MacroMetrics';
import SearchFilterBar, { DEFAULT_FILTERS } from './SearchFilterBar';
import CohortsGrid from './CohortsGrid';
import MenteeDetailModal from './MenteeDetailModal';

export default function DatabaseViewerPage({ activeWorkspace, setActiveWorkspace, onBack }) {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [page, setPage] = useState(1);
  const [docsResult, setDocsResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cards view, reusing the exact same components the live match results
  // use — only applies to the "directory" collection, since that's the
  // one collection whose shape (mentor -> mentees) actually maps onto them.
  const [directoryCohorts, setDirectoryCohorts] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [reallocVisible, setReallocVisible] = useState(false); // unused toggle target, kept for prop compatibility
  const [adminSelectedStudent, setAdminSelectedStudent] = useState(null);

  const isCardsView = selectedCollection === 'directory' && Boolean(activeWorkspace);

  const handleViewStudentSessions = async (student) => {
    if (!activeWorkspace?.db_name) return;
    const result = await apiGetMenteeSessionsAdmin(student.uid, activeWorkspace.db_name);
    if (result.ok) {
      setAdminSelectedStudent({ ...student, sessions: result.sessions });
    } else {
      alert(`Error loading sessions: ${result.error}`);
    }
  };
  const refreshCollections = async () => {
    setLoading(true);
    const result = await apiListCollections(activeWorkspace?.db_name);
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setError('');
    setCollections(result.data);
    setSelectedCollection(result.data[0]?.name || '');
    setPage(1);
  };

  useEffect(() => { refreshCollections(); }, [activeWorkspace?.db_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cards-view fetch
  useEffect(() => {
    if (!isCardsView) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await apiGetDirectoryAsCohorts(activeWorkspace.db_name);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) { setError(result.error); return; }
      setError('');
      setDirectoryCohorts(result.cohorts);
    })();
    return () => { cancelled = true; };
  }, [isCardsView, activeWorkspace?.db_name]);

  // Raw-JSON-view fetch (every collection except "directory")
  useEffect(() => {
    if (isCardsView || !selectedCollection) { setDocsResult(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await apiListDocuments(activeWorkspace?.db_name, selectedCollection, page, 20);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) { setError(result.error); return; }
      setError('');
      setDocsResult(result.data);
    })();
    return () => { cancelled = true; };
  }, [isCardsView, activeWorkspace?.db_name, selectedCollection, page]);

  const mentorOptions = useMemo(() => directoryCohorts.map(c => c.mentor), [directoryCohorts]);
  const sectionOptions = useMemo(() => {
    const sections = new Set();
    directoryCohorts.forEach(c => c.students.forEach(s => sections.add(s.Section)));
    return Array.from(sections).sort();
  }, [directoryCohorts]);
  const maxCohortSize = useMemo(
    () => Math.max(1, ...directoryCohorts.map(c => c.student_count), 1),
    [directoryCohorts]
  );
  const { cards, totalMatchedStudents } = useMemo(
    () => filterCohorts(directoryCohorts, filters),
    [directoryCohorts, filters]
  );
  const resultLabel = `${cards.length} mentor cohort(s) \u00b7 ${totalMatchedStudents} student(s) saved`;

  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Database Viewer</h1>
          <p>Read-only — {activeWorkspace ? `database: ${activeWorkspace.name}` : 'control database'}</p>
        </div>
        <button className="ghost-btn" onClick={onBack}>← Back</button>
      </header>

      <div className="sidebar-panel" style={{ marginBottom: 20, maxWidth: 420 }}>
        <WorkspaceSelector activeWorkspace={activeWorkspace} onSelect={setActiveWorkspace} />
        <small>Leave unselected to browse the control database (admin logins, workspace registry).</small>

        <div className="upload-group" style={{ marginTop: 10 }}>
          <label>Collection</label>
          <select value={selectedCollection} onChange={(e) => { setSelectedCollection(e.target.value); setPage(1); }}>
            <option value="" disabled>Select a collection…</option>
            {collections.map(c => (
              <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="status-line err" style={{ marginBottom: 16 }}>{error}</div>}

      {isCardsView ? (
        <>
          {directoryCohorts.length > 0 && <MacroMetrics cohorts={directoryCohorts} />}

          {directoryCohorts.length > 0 && (
            <SearchFilterBar
              filters={filters}
              setFilters={setFilters}
              mentorOptions={mentorOptions}
              sectionOptions={sectionOptions}
              maxCohortSize={maxCohortSize}
              resultLabel={resultLabel}
              hasReallocation={false}
              onToggleRealloc={() => setReallocVisible(v => !v)}
            />
          )}

          <CohortsGrid
            matching={loading}
            matchError={error}
            cards={cards}
            hasRun={true}
            onViewStudent={handleViewStudentSessions}
          />
        </>
      ) : (
        <>
          {loading && <p className="empty-note">Loading…</p>}

          {!loading && docsResult && (
            <>
              <div className="dataset-editor-footer" style={{ marginBottom: 10 }}>
                <span className="status-line">
                  Page {docsResult.page} of {docsResult.total_pages} · {docsResult.total} document(s) total
                </span>
                <div className="save-row" style={{ width: 'auto' }}>
                  <button className="ghost-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                  <button className="ghost-btn" disabled={page >= docsResult.total_pages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
              </div>

              {docsResult.documents.length === 0 ? (
                <p className="empty-note">This collection is empty.</p>
              ) : (
                docsResult.documents.map((doc, i) => (
                  <div className="dataset-editor" key={doc._id || i}>
                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#E2E8F0' }}>
                      {JSON.stringify(doc, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </>
          )}
        </>
      )}

      {adminSelectedStudent && (
        <MenteeDetailModal
          mentee={adminSelectedStudent}
          onClose={() => setAdminSelectedStudent(null)}
          readOnly={true}
        />
      )}

      
    </div>
  );
}