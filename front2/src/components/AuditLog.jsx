import { useState } from 'react';

// ---------------------------------------------------------------------------
// AuditLog.jsx
//
// Feature: a persistent, timestamped history of every mentor addition and
// removal, kept in the sidebar. Each entry records exactly which mentees
// moved, from/to which mentor, and can be expanded into a table or
// downloaded as a standalone CSV — independent of whatever the main
// results table currently shows.
//
// Entries are built by useMentorEngine's recordAuditEvent(), from the raw
// payload returned by /api/rebalance-add ({ new_mentor, students_pulled,
// sources }) or /api/rebalance-remove ({ removed_mentor,
// students_reassigned, redistribution }); see lib/auditLog.js for the
// shape normalization.
// ---------------------------------------------------------------------------

function csvEscape(val) {
  const str = String(val ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadAuditCSV(event) {
  const isAdd = event.type === 'add';
  const header = isAdd
    ? ['Student Name', 'Section', 'Grade', 'CGPA', 'Previous Mentor', 'New Mentor']
    : ['Student Name', 'Section', 'Grade', 'CGPA', 'Removed Mentor', 'New Mentor'];

  const lines = [header.map(csvEscape).join(',')];
  event.breakdown.forEach(bucket => {
    bucket.students.forEach(s => {
      const line = isAdd
        ? [s.name, s.Section, s.Grade, s.CGPA, bucket.mentor, event.mentor]
        : [s.name, s.Section, s.Grade, s.CGPA, event.mentor, bucket.mentor];
      lines.push(line.map(csvEscape).join(','));
    });
  });

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeMentorName = event.mentor.replace(/[^A-Za-z0-9_-]/g, '_');
  a.href = url;
  a.download = `${isAdd ? 'added' : 'redistribution'}_${safeMentorName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function AuditModal({ event, onClose }) {
  const isAdd = event.type === 'add';
  const otherMentorHeader = isAdd ? 'Previous Mentor' : 'New Mentor';

  const rows = [];
  event.breakdown.forEach(bucket => {
    bucket.students.forEach(s => rows.push({ ...s, otherMentor: bucket.mentor }));
  });

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <div>
            <h3>{isAdd ? 'Added to' : 'Redistributed from'} {event.mentor}</h3>
            <p>{event.count} student(s) {isAdd ? 'pulled in from' : 'reassigned across'} {event.breakdown.length} mentor(s)</p>
          </div>
          <button className="modal-close-btn" title="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-table-wrapper">
          <table className="modal-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Section</th>
                <th>Grade</th>
                <th>CGPA</th>
                <th>{otherMentorHeader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="empty-note">No students in this event.</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td><strong>{r.name}</strong></td>
                    <td className="col-mono">{r.Section}</td>
                    <td className="col-mono">{r.Grade}</td>
                    <td className="col-mono">{typeof r.CGPA === 'number' ? r.CGPA.toFixed(2) : r.CGPA}</td>
                    <td className="new-mentor-cell">{r.otherMentor}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="ghost-btn" onClick={() => downloadAuditCSV(event)}>Download list (.csv)</button>
          <button className="action-btn" style={{ padding: '8px 16px' }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function AuditLog({ entries }) {
  const [openEventId, setOpenEventId] = useState(null);
  const openEvent = entries.find(ev => ev.id === openEventId) || null;

  return (
    <>
      <div className="panel-section-title" style={{ marginTop: 4 }}>Audit Log</div>
      <div className="redistribution-log">
        {entries.length === 0 ? (
          <p className="log-empty-note">
            No mentor changes yet. Add or remove a mentor row above and exactly
            which mentees moved (and where) will show up here.
          </p>
        ) : (
          entries.map(ev => {
            const isAdd = ev.type === 'add';
            const timeStr = ev.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const arrow = isAdd ? '←' : '→';
            return (
              <div className="log-entry" key={ev.id}>
                <div className={`log-entry-mentor${isAdd ? ' added' : ''}`}>
                  {ev.mentor} <span className="log-entry-verb">({isAdd ? 'added' : 'removed'})</span>
                </div>
                <div className="log-entry-meta">
                  {ev.count} student(s) {arrow} {ev.breakdown.length} mentor(s) · {timeStr}
                </div>
                <div className="log-entry-actions">
                  <button onClick={() => setOpenEventId(ev.id)}>Show list</button>
                  <button className="download-btn" onClick={() => downloadAuditCSV(ev)}>Download</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {openEvent && <AuditModal event={openEvent} onClose={() => setOpenEventId(null)} />}
    </>
  );
}
