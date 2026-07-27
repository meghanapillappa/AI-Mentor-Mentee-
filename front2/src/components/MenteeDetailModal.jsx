import { useState } from 'react';
import { apiAddMenteeSession } from '../lib/api';

export default function MenteeDetailModal({ mentee, onClose, onSessionAdded }) {
  const sessions = mentee?.sessions || [];
  const nextSessionNumber = sessions.length > 0
    ? Math.max(...sessions.map(s => s.session_number || 0)) + 1
    : 1;

  const [sessionNumber, setSessionNumber] = useState(nextSessionNumber);
  const [attendance, setAttendance] = useState('');
  const [remarks, setRemarks] = useState('');
  const [skillsLearned, setSkillsLearned] = useState('');
  const [improvements, setImprovements] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!mentee) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const result = await apiAddMenteeSession(mentee.uid, {
      session_number: Number(sessionNumber),
      attendance: attendance === '' ? null : Number(attendance),
      remarks,
      skills_learned: skillsLearned,
      improvements,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSessionAdded(result.data.session);
    setSessionNumber(Number(sessionNumber) + 1);
    setAttendance('');
    setRemarks('');
    setSkillsLearned('');
    setImprovements('');
  }

  return (
    <div className="mentee-modal-overlay" onClick={onClose}>
      <div className="mentee-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mentee-modal-header">
          <div>
            <h2>{mentee.name}</h2>
            <p className="mentee-modal-meta">
              Grade {mentee.Grade} &middot; Section {mentee.Section} &middot; CGPA {Number(mentee.CGPA).toFixed(2)}
            </p>
          </div>
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>

        <div className="mentee-modal-body">
          <section className="mentee-modal-history">
            <h3>Session History</h3>
            {sessions.length === 0 ? (
              <p className="empty-note">No sessions recorded yet.</p>
            ) : (
              <div className="session-list">
                {[...sessions].sort((a, b) => (b.session_number || 0) - (a.session_number || 0)).map((s, i) => (
                  <div className="session-card" key={i}>
                    <div className="session-card-header">
                      <strong>Session {s.session_number}</strong>
                      {s.attendance != null && (
                        <span className="highlight-metric">{s.attendance}% attendance</span>
                      )}
                    </div>
                    {s.skills_learned && <p><strong>Skills learned:</strong> {s.skills_learned}</p>}
                    {s.improvements && <p><strong>Areas to improve:</strong> {s.improvements}</p>}
                    {s.remarks && <p><strong>Remarks:</strong> {s.remarks}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mentee-modal-form">
            <h3>Add New Session</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label>
                  Session number
                  <input
                    type="number"
                    min="1"
                    value={sessionNumber}
                    onChange={(e) => setSessionNumber(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Attendance up to this session (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={attendance}
                    onChange={(e) => setAttendance(e.target.value)}
                    placeholder="e.g. 92"
                  />
                </label>
              </div>
              <label>
                Skills / topics learned
                <textarea
                  value={skillsLearned}
                  onChange={(e) => setSkillsLearned(e.target.value)}
                  rows={2}
                />
              </label>
              <label>
                Areas to improve
                <textarea
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                  rows={2}
                />
              </label>
              <label>
                Remarks
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button className="primary-btn" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save session'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
