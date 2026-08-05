import { Fragment, useEffect, useState } from 'react';
import { apiListWorkspaces, apiGetDirectoryAsCohorts } from '../lib/api';

/**
 * Read-only dashboard for the "viewer" role: pick a workspace, see every
 * mentor's cohort with full student details (Name/CGPA/Section/etc.),
 * pulled straight from the directory collection via
 * /api/db-viewer/directory-as-cohorts. No create/edit/delete controls —
 * viewers can't reach any endpoint that would need them anyway.
 */

// Deterministic accent color per mentor, so the same name always gets the
// same "swatch" across renders instead of a random one on every reload.
const AVATAR_HUES = [210, 265, 25, 155, 335, 190, 45, 285];
function hueForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}
function initialsForName(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PRETTY_LABEL = {
  uid: 'UID',
  cgpa: 'CGPA',
};
function prettyCol(col) {
  if (PRETTY_LABEL[col]) return PRETTY_LABEL[col];
  return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ViewerHome({ username, onLogout }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspacesError, setWorkspacesError] = useState('');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [cohorts, setCohorts] = useState([]);
  const [cohortsError, setCohortsError] = useState('');
  const [loadingCohorts, setLoadingCohorts] = useState(false);

  const [expandedMentor, setExpandedMentor] = useState(null);
  const [expandedStudent, setExpandedStudent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await apiListWorkspaces();
      if (cancelled) return;
      setLoadingWorkspaces(false);
      if (result.ok) {
        setWorkspaces(result.data);
      } else {
        setWorkspacesError(result.error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedWorkspace) return;
    let cancelled = false;
    setLoadingCohorts(true);
    setCohortsError('');
    setExpandedMentor(null);
    (async () => {
      const result = await apiGetDirectoryAsCohorts(selectedWorkspace.db_name);
      if (cancelled) return;
      setLoadingCohorts(false);
      if (result.ok) {
        setCohorts(result.cohorts);
      } else {
        setCohortsError(result.error);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedWorkspace]);

  const totalStudents = cohorts.reduce((sum, c) => sum + c.student_count, 0);

  // Each mentee's profile carries a "sessions" array (one entry per
  // session a mentor has logged for them via /api/mentee-sessions) — count
  // it per mentee, and sum across a cohort for the mentor's total.
  const sessionsAttended = (student) => Array.isArray(student.sessions) ? student.sessions.length : 0;
  const cohortSessionsTotal = (cohort) => cohort.students.reduce((sum, s) => sum + sessionsAttended(s), 0);
  const totalSessions = cohorts.reduce((sum, c) => sum + cohortSessionsTotal(c), 0);
  const overallAvgGpa = cohorts.length
    ? (cohorts.reduce((sum, c) => sum + (Number(c.average_gpa) || 0) * c.student_count, 0) / (totalStudents || 1)).toFixed(2)
    : '—';

  return (
    <div className="vh-root">
      <style>{VH_STYLES}</style>

      <header className="vh-header">
        <div className="vh-title-group">
          <span className="vh-eyebrow">Directory &middot; read-only</span>
          <h1>Welcome, {username}</h1>
          <p>Every mentor and mentee, current assignments, at a glance.</p>
        </div>
        <button className="vh-btn vh-btn-ghost" onClick={onLogout}>Log out</button>
      </header>

      <div className="vh-body">
        {loadingWorkspaces && <div className="vh-skeleton-row" aria-hidden="true" />}
        {workspacesError && <div className="vh-banner vh-banner-error">{workspacesError}</div>}

        {!loadingWorkspaces && !workspacesError && workspaces.length === 0 && (
          <div className="vh-empty">No workspaces exist yet.</div>
        )}

        {workspaces.length > 0 && (
          <div className="vh-workspace-row">
            {workspaces.map(ws => {
              const active = ws.db_name === selectedWorkspace?.db_name;
              return (
                <button
                  key={ws.db_name}
                  className={`vh-workspace-pill ${active ? 'is-active' : ''}`}
                  onClick={() => setSelectedWorkspace(ws)}
                >
                  <span className="vh-workspace-name">{ws.name}</span>
                  <span className="vh-workspace-meta">{ws.mentor_count} mentors &middot; {ws.mentee_count} mentees</span>
                </button>
              );
            })}
          </div>
        )}

        {selectedWorkspace && (
          <>
            {loadingCohorts && <div className="vh-skeleton-row" aria-hidden="true" />}
            {cohortsError && <div className="vh-banner vh-banner-error">{cohortsError}</div>}

            {!loadingCohorts && !cohortsError && (
              <>
                <div className="vh-stat-strip">
                  <div className="vh-stat-card">
                    <span className="vh-stat-value">{cohorts.length}</span>
                    <span className="vh-stat-label">Mentor cohorts</span>
                  </div>
                  <div className="vh-stat-card">
                    <span className="vh-stat-value">{totalStudents}</span>
                    <span className="vh-stat-label">Students total</span>
                  </div>
                  <div className="vh-stat-card">
                    <span className="vh-stat-value">{totalSessions}</span>
                    <span className="vh-stat-label">Sessions logged</span>
                  </div>
                  <div className="vh-stat-card">
                    <span className="vh-stat-value">{overallAvgGpa}</span>
                    <span className="vh-stat-label">Avg. CGPA</span>
                  </div>
                </div>

                {cohorts.length === 0 && (
                  <div className="vh-empty">No cohorts in this workspace yet.</div>
                )}

                <div className="vh-cohort-list">
                  {cohorts.map(cohort => {
                    const isOpen = expandedMentor === cohort.mentor;
                    const hue = hueForName(cohort.mentor);
                    const gpaPct = Math.max(0, Math.min(100, (Number(cohort.average_gpa) || 0) / 10 * 100));

                    return (
                      <div key={cohort.mentor} className={`vh-cohort-card ${isOpen ? 'is-open' : ''}`}>
                        <button
                          className="vh-cohort-header"
                          onClick={() => { setExpandedMentor(isOpen ? null : cohort.mentor); setExpandedStudent(null); }}
                          aria-expanded={isOpen}
                        >
                          <span
                            className="vh-avatar"
                            style={{ background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 55% 32%)` }}
                          >
                            {initialsForName(cohort.mentor)}
                          </span>

                          <span className="vh-cohort-heading">
                            <span className="vh-cohort-name">{cohort.mentor}</span>
                            <span className="vh-cohort-sub">
                              {cohort.student_count} student{cohort.student_count === 1 ? '' : 's'}
                              {' '}&middot;{' '}
                              {cohortSessionsTotal(cohort)} session{cohortSessionsTotal(cohort) === 1 ? '' : 's'} logged
                            </span>
                          </span>

                          <span className="vh-gpa-block">
                            <span className="vh-gpa-value">{cohort.average_gpa}</span>
                            <span className="vh-gpa-bar-track">
                              <span className="vh-gpa-bar-fill" style={{ width: `${gpaPct}%`, background: `hsl(${hue} 60% 55%)` }} />
                            </span>
                            <span className="vh-gpa-caption">avg CGPA</span>
                          </span>

                          <span className={`vh-chevron ${isOpen ? 'is-open' : ''}`}>&#9656;</span>
                        </button>

                        {isOpen && (() => {
                          // "sessions" is a nested array (one entry per logged
                          // session) — too unwieldy for a flat table cell, so
                          // it's dropped from the generic column list and
                          // replaced with a single "Sessions Attended" count.
                          const cols = cohort.students[0]
                            ? Object.keys(cohort.students[0]).filter(col => col !== 'sessions')
                            : [];
                          return (
                            <div className="vh-table-wrap">
                              <table className="vh-table">
                                <thead>
                                  <tr>
                                    {cols.map(col => (
                                      <th key={col}>{prettyCol(col)}</th>
                                    ))}
                                    <th>Sessions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cohort.students.map((s, i) => {
                                    const studentKey = s.uid || i;
                                    const studentOpen = expandedStudent === studentKey;
                                    const sessions = Array.isArray(s.sessions) ? s.sessions : [];
                                    return (
                                      <Fragment key={studentKey}>
                                        <tr
                                          onClick={() => sessions.length && setExpandedStudent(studentOpen ? null : studentKey)}
                                          className={`vh-student-row ${sessions.length ? 'is-clickable' : ''} ${studentOpen ? 'is-open' : ''}`}
                                        >
                                          {cols.map(col => (
                                            <td key={col}>{String(s[col] ?? '')}</td>
                                          ))}
                                          <td>
                                            <span className={`vh-session-pill ${sessions.length ? '' : 'is-zero'}`}>
                                              {sessions.length ? (
                                                <span className={`vh-chevron vh-chevron-sm ${studentOpen ? 'is-open' : ''}`}>&#9656;</span>
                                              ) : null}
                                              {sessionsAttended(s)}
                                            </span>
                                          </td>
                                        </tr>
                                        {studentOpen && sessions.length > 0 && (
                                          <tr key={`${studentKey}-detail`} className="vh-detail-row">
                                            <td colSpan={cols.length + 1}>
                                              <div className="vh-session-grid">
                                                {[...sessions]
                                                  .sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0))
                                                  .map((sess, si) => (
                                                    <div className="vh-session-card" key={si}>
                                                      <div className="vh-session-card-head">
                                                        <span className="vh-session-number">Session {sess.session_number}</span>
                                                        <span className={`vh-attendance-tag ${String(sess.attendance).toLowerCase() === 'present' ? 'is-present' : 'is-absent'}`}>
                                                          {sess.attendance ?? '—'}
                                                        </span>
                                                      </div>
                                                      {sess.remarks && (
                                                        <p className="vh-session-field"><strong>Remarks</strong> {sess.remarks}</p>
                                                      )}
                                                      {sess.skills_learned && (
                                                        <p className="vh-session-field"><strong>Skills learned</strong> {sess.skills_learned}</p>
                                                      )}
                                                      {sess.improvements && (
                                                        <p className="vh-session-field"><strong>Improvements</strong> {sess.improvements}</p>
                                                      )}
                                                      {sess.recorded_at && (
                                                        <p className="vh-session-timestamp">{sess.recorded_at}</p>
                                                      )}
                                                    </div>
                                                  ))}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const VH_STYLES = `
.vh-root {
  --vh-bg: #0b1220;
  --vh-surface: #111a2c;
  --vh-surface-raised: #16213a;
  --vh-border: #23304a;
  --vh-text: #e7ecf7;
  --vh-muted: #93a1bd;
  --vh-accent: #6d8bff;
  --vh-accent-soft: #1b2648;
  --vh-good: #3ecf8e;
  --vh-bad: #f0745a;
  background: var(--vh-bg);
  color: var(--vh-text);
  min-height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
}

.vh-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.75rem 1.75rem 1.25rem;
  border-bottom: 1px solid var(--vh-border);
}
.vh-eyebrow {
  display: inline-block;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vh-accent);
  font-weight: 600;
  margin-bottom: 0.35rem;
}
.vh-title-group h1 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.vh-title-group p {
  margin: 0.3rem 0 0;
  color: var(--vh-muted);
  font-size: 0.88rem;
}

.vh-btn {
  border: 1px solid var(--vh-border);
  background: var(--vh-surface);
  color: var(--vh-text);
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.vh-btn-ghost:hover { background: var(--vh-surface-raised); border-color: var(--vh-accent); }

.vh-body { padding: 1.5rem 1.75rem 3rem; max-width: 1080px; margin: 0 auto; }

.vh-skeleton-row {
  height: 46px;
  border-radius: 10px;
  background: linear-gradient(90deg, var(--vh-surface) 25%, var(--vh-surface-raised) 37%, var(--vh-surface) 63%);
  background-size: 400% 100%;
  animation: vh-shimmer 1.4s ease infinite;
  margin-bottom: 1.25rem;
}
@keyframes vh-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

.vh-banner {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  margin-bottom: 1.25rem;
}
.vh-banner-error { background: rgba(240, 116, 90, 0.12); color: #ff9d84; border: 1px solid rgba(240, 116, 90, 0.35); }

.vh-empty {
  color: var(--vh-muted);
  font-size: 0.9rem;
  padding: 1.5rem;
  text-align: center;
  border: 1px dashed var(--vh-border);
  border-radius: 10px;
}

.vh-workspace-row { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1.75rem; }
.vh-workspace-pill {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  background: var(--vh-surface);
  border: 1px solid var(--vh-border);
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
  color: var(--vh-text);
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
}
.vh-workspace-pill:hover { border-color: var(--vh-accent); transform: translateY(-1px); }
.vh-workspace-pill.is-active { background: var(--vh-accent-soft); border-color: var(--vh-accent); }
.vh-workspace-name { font-weight: 600; font-size: 0.88rem; }
.vh-workspace-meta { font-size: 0.72rem; color: var(--vh-muted); }

.vh-stat-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.vh-stat-card {
  background: var(--vh-surface);
  border: 1px solid var(--vh-border);
  border-radius: 10px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.vh-stat-value { font-size: 1.5rem; font-weight: 650; letter-spacing: -0.02em; }
.vh-stat-label { font-size: 0.72rem; color: var(--vh-muted); text-transform: uppercase; letter-spacing: 0.04em; }

.vh-cohort-list { display: flex; flex-direction: column; gap: 0.65rem; }

.vh-cohort-card {
  background: var(--vh-surface);
  border: 1px solid var(--vh-border);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.vh-cohort-card.is-open { border-color: var(--vh-accent); }

.vh-cohort-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.8rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--vh-text);
  text-align: left;
}
.vh-cohort-header:hover { background: var(--vh-surface-raised); }

.vh-avatar {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
}

.vh-cohort-heading { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.vh-cohort-name { font-weight: 600; font-size: 0.95rem; }
.vh-cohort-sub { font-size: 0.76rem; color: var(--vh-muted); }

.vh-gpa-block { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; width: 110px; }
.vh-gpa-value { font-size: 0.85rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.vh-gpa-bar-track { width: 100%; height: 4px; border-radius: 2px; background: var(--vh-border); overflow: hidden; }
.vh-gpa-bar-fill { display: block; height: 100%; border-radius: 2px; }
.vh-gpa-caption { font-size: 0.65rem; color: var(--vh-muted); text-transform: uppercase; letter-spacing: 0.03em; }

.vh-chevron {
  flex: 0 0 auto;
  display: inline-block;
  color: var(--vh-muted);
  transition: transform 0.15s ease;
  font-size: 0.7rem;
}
.vh-chevron.is-open { transform: rotate(90deg); color: var(--vh-accent); }
.vh-chevron-sm { margin-right: 0.3rem; }

.vh-table-wrap { border-top: 1px solid var(--vh-border); overflow-x: auto; }
.vh-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.vh-table th {
  text-align: left;
  padding: 0.55rem 0.9rem;
  color: var(--vh-muted);
  font-weight: 550;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: var(--vh-surface-raised);
  white-space: nowrap;
  position: sticky;
  top: 0;
}
.vh-table td { padding: 0.55rem 0.9rem; border-top: 1px solid var(--vh-border); vertical-align: middle; }
.vh-student-row.is-clickable { cursor: pointer; }
.vh-student-row.is-clickable:hover { background: var(--vh-surface-raised); }
.vh-student-row.is-open { background: var(--vh-accent-soft); }

.vh-session-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: var(--vh-surface-raised);
  border: 1px solid var(--vh-border);
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
}
.vh-session-pill.is-zero { color: var(--vh-muted); }

.vh-detail-row td { padding: 0.75rem 0.9rem 1.1rem; background: rgba(109, 139, 255, 0.04); }

.vh-session-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.6rem;
}
.vh-session-card {
  background: var(--vh-surface-raised);
  border: 1px solid var(--vh-border);
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.vh-session-card-head { display: flex; align-items: center; justify-content: space-between; }
.vh-session-number { font-weight: 600; font-size: 0.8rem; }
.vh-attendance-tag {
  font-size: 0.68rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  text-transform: capitalize;
  font-weight: 600;
}
.vh-attendance-tag.is-present { background: rgba(62, 207, 142, 0.15); color: var(--vh-good); }
.vh-attendance-tag.is-absent { background: rgba(240, 116, 90, 0.15); color: var(--vh-bad); }

.vh-session-field { margin: 0; font-size: 0.78rem; line-height: 1.4; color: var(--vh-text); }
.vh-session-field strong { color: var(--vh-muted); font-weight: 550; margin-right: 0.3rem; }
.vh-session-timestamp { margin: 0.15rem 0 0; font-size: 0.68rem; color: var(--vh-muted); }

@media (max-width: 640px) {
  .vh-cohort-header { flex-wrap: wrap; }
  .vh-gpa-block { width: auto; align-items: flex-start; }
  .vh-table-wrap { border-top: none; }
}
`;
