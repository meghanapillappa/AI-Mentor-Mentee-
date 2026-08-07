export default function CohortCard({
  cohort,
  mentorNameMatches,
  renderedSlice,
  totalAfterFilters,
  isTruncated,
  viewLimitCount,
  searchTerm,
  anyStudentFilterActive,
  onViewStudent // Ensure this prop is here
}){
  
  // ADD THIS LINE RIGHT HERE:
  const colCount = onViewStudent ? 5 : 4; 
  return (
    <div className="cohort-card">
      <div className="cohort-header">
        <div className="cohort-mentor">
          {cohort.mentor}
          {mentorNameMatches && <span className="mentor-match-badge">MATCH</span>}
        </div>
        <div className="cohort-summary-meta">
          Allocated: <strong>{cohort.student_count}</strong> &nbsp;|&nbsp; Avg:{' '}
          <span className="highlight-metric">{cohort.average_gpa.toFixed(3)}</span>
          {anyStudentFilterActive && (
            <>&nbsp;|&nbsp; Matching: <strong>{totalAfterFilters}</strong></>
          )}
          {isTruncated && (
            <>&nbsp;|&nbsp; Displaying: <strong>{viewLimitCount}</strong></>
          )}
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
              {onViewStudent && <th></th>}
            </tr>
          </thead>
          <tbody>
            {renderedSlice.length === 0 && (
              <tr><td colSpan={colCount} className="empty-note">No students match the current filters.</td></tr>
            )}
            {renderedSlice.map(s => {
              const isMatch = Boolean(searchTerm) && !mentorNameMatches && s.name.toLowerCase().includes(searchTerm);
              return (
                <tr key={s.uid ?? s.name} className={isMatch ? 'search-match' : ''}>
                  <td><strong>{s.name}</strong></td>
                  <td className="col-mono">
                    <span className={`grade-pill grade-${s.Grade.toLowerCase()}`}>{s.Grade}</span>
                  </td>
                  <td className="col-mono">Section {s.Section}</td>
                  <td className="col-mono col-gpa">{s.CGPA.toFixed(2)}</td>
                  {onViewStudent && (
                    <td style={{ textAlign: 'right' }}>
                      <button className="ghost-btn" onClick={() => onViewStudent(s)}>
                        View Sessions
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {isTruncated && (
              <tr className="view-limit-more">
                <td colSpan={4}>
                  ⋯ {totalAfterFilters - viewLimitCount} more mentee(s) not shown (view limit: {viewLimitCount})
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
