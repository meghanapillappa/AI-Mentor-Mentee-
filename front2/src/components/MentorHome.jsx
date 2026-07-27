import { useEffect, useState } from 'react';
import MenteeDetailModal from './MenteeDetailModal';

export default function MentorHome({ username, cohort, onLogout }) {
  const [students, setStudents] = useState(cohort?.students || []);
  const [selectedMentee, setSelectedMentee] = useState(null);

  useEffect(() => {
    setStudents(cohort?.students || []);
  }, [cohort]);

  function handleSessionAdded(newSession) {
    setStudents(prev => prev.map(s =>
      s.uid === selectedMentee.uid
        ? { ...s, sessions: [...(s.sessions || []), newSession] }
        : s
    ));
    setSelectedMentee(prev => prev
      ? { ...prev, sessions: [...(prev.sessions || []), newSession] }
      : prev);
  }

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
                  <th style={{ textAlign: 'right' }}>Sessions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr><td colSpan={6} className="empty-note">No mentees in this cohort.</td></tr>
                ) : (
                  students.map(s => (
                    <tr key={s.uid ?? s.name}>
                      <td><strong>{s.name}</strong></td>
                      <td className="col-mono">
                        <span className={`grade-pill grade-${s.Grade.toLowerCase()}`}>{s.Grade}</span>
                      </td>
                      <td className="col-mono">Section {s.Section}</td>
                      <td className="col-mono col-gpa">{s.CGPA.toFixed(2)}</td>
                      <td className="col-mono" style={{ textAlign: 'right' }}>
                        {(s.sessions || []).length}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="ghost-btn" onClick={() => setSelectedMentee(s)}>
                          View / Add Notes
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedMentee && (
        <MenteeDetailModal
          mentee={selectedMentee}
          onClose={() => setSelectedMentee(null)}
          onSessionAdded={handleSessionAdded}
        />
      )}
    </div>
  );
}
