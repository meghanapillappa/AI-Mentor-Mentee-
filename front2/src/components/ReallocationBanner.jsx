export default function ReallocationBanner({ report, onClose }) {
  if (!report) return null;
  const { removedMentor, moves } = report;

  // Group moves by destination mentor
  const grouped = new Map();
  moves.forEach(m => {
    if (!grouped.has(m.toMentor)) grouped.set(m.toMentor, []);
    grouped.get(m.toMentor).push(m.student);
  });
  const groups = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="reallocation-banner">
      <div className="reallocation-banner-header">
        <div>
          <strong>⚠ Reallocation report</strong> &nbsp;
          <span className="realloc-summary">Mentor "{removedMentor}" removed — {moves.length} mentee(s) redistributed</span>
        </div>
        <button className="ghost-btn" onClick={onClose}>Close</button>
      </div>
      <div>
        {groups.length === 0 ? (
          <p className="empty-note">No mentees needed to move.</p>
        ) : (
          groups.map(([mentorName, students]) => (
            <div className="realloc-group" key={mentorName}>
              <div className="realloc-group-header">
                <span>→ {mentorName}</span>
                <span className="count">{students.length} mentee{students.length === 1 ? '' : 's'}</span>
              </div>
              <div className="realloc-student-list">
                {students.map(s => (
                  <span className="realloc-student-chip" key={s.uid ?? s.name}>
                    {s.name} ({s.CGPA.toFixed(2)})
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
