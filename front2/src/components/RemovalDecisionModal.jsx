import { useState } from 'react';

export default function RemovalDecisionModal({ pending, onResolve }) {
  const [target, setTarget] = useState('');

  if (!pending) return null;
  const { removedName, orphanedStudents, mentorOptions } = pending;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>Removing "{removedName}"</h3>
        <p>
          This mentor has {orphanedStudents.length} mentee{orphanedStudents.length === 1 ? '' : 's'}.
          How should they be reassigned?
        </p>

        <div className="modal-actions-column">
          <button className="primary" onClick={() => onResolve({ mode: 'auto' })}>
            Auto-balance across all remaining mentors
          </button>

          <div className="modal-direct-row">
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a mentor…</option>
              {mentorOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button disabled={!target} onClick={() => onResolve({ mode: 'direct', targetMentor: target })}>
              Send all {orphanedStudents.length} to this mentor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}