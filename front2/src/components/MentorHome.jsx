// ---------------------------------------------------------------------------
// MentorHome.jsx
//
// Mentor-facing landing page. Shows exactly one cohort: the mentor's own.
// This is intentionally NOT CohortsGrid/CohortCard reused as-is — those are
// built for the admin's multi-mentor, filterable view (search, view-limit,
// "MATCH" badges, etc). A mentor only ever sees their own single roster, so
// none of that chrome applies. This component borrows the same table markup
// and CSS classes (roster-table, grade-pill, col-mono, col-gpa) so it stays
// visually consistent with the admin view for free.
//
// Props:
//   username  - display name for the header (same pattern as UserHome)
//   cohort    - { mentor, student_count, average_gpa, students: [...] } | null
//               null/undefined means no match has been run yet, or this
//               mentor has no assignment — render an empty state, don't crash.
//   onLogout  - same as UserHome
//
// NOTE ON WIRING THIS UP (not part of this file, but required for it to
// receive real data): App.jsx needs to resolve which single cohort belongs
// to the logged-in mentor and pass just that one object in as `cohort`. That
// resolution depends on what your /api/login or /api/me session shape
// actually contains (a mentor_id/mentor_name that matches cohort.mentor).
// This component doesn't care how that happens — it just renders whatever
// single cohort it's handed.
// ---------------------------------------------------------------------------

export default function MentorHome({ username, cohort, onLogout }) {
  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Welcome, {username}</h1>
          <p>
            {cohort
              ? `You have ${cohort.student_count} mentee(s) assigned.`
              : 'No mentees assigned to you yet.'}
          </p>
        </div>
        <button className="ghost-btn" onClick={onLogout}>Log out</button>
      </header>

      {!cohort ? (
        <div className="roster-grid">
          <p className="empty-note">
            You don't have any mentees assigned yet. Once an admin runs the
            balancing algorithm, your roster will show up here.
          </p>
        </div>
      ) : (
        <div className="cohort-card">
          <div className="cohort-header">
            <div className="cohort-mentor">{cohort.mentor}</div>
            <div className="cohort-summary-meta">
              Assigned: <strong>{cohort.student_count}</strong> &nbsp;|&nbsp; Avg CGPA:{' '}
              <span className="highlight-metric">{cohort.average_gpa.toFixed(3)}</span>
            </div>
          </div>
          <div className="data-table-wrapper">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Assigned Grade</th>
                  <th>Section</th>
                  <th style={{ textAlign: 'right' }}>CGPA</th>
                </tr>
              </thead>
              <tbody>
                {cohort.students.length === 0 ? (
                  <tr><td colSpan={4} className="empty-note">No mentees in this cohort.</td></tr>
                ) : (
                  cohort.students.map(s => (
                    <tr key={s.uid ?? s.name}>
                      <td><strong>{s.name}</strong></td>
                      <td className="col-mono">
                        <span className={`grade-pill grade-${s.Grade.toLowerCase()}`}>{s.Grade}</span>
                      </td>
                      <td className="col-mono">Section {s.Section}</td>
                      <td className="col-mono col-gpa">{s.CGPA.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
