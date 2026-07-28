import { useEffect, useState } from 'react';
import { apiGetMyProfile, apiUpdateMyProfile, apiGetMessages, apiSendMessage } from '../lib/api';

const EDITABLE_FIELDS = [
  { key: 'about_me', label: 'About me', placeholder: 'A little about yourself…' },
  { key: 'goals', label: 'Goals for this mentorship', placeholder: 'What do you want to get out of it?' },
  { key: 'interests', label: 'Interests', placeholder: 'Hobbies, subjects, clubs…' },
];

const CONTACT_FIELDS = [
  { key: 'contact_email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'contact_phone', label: 'Phone', placeholder: '+91 …' },
];

// Inline style objects built from index.css's own custom properties, since
// there's no .card class defined globally — this keeps every box on-theme
// without touching the shared stylesheet.
const box = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '20px',
};

const boxTitle = {
  fontSize: '18px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  marginBottom: '16px',
};

const fieldLabel = {
  display: 'block',
  fontSize: '12.5px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  marginBottom: '6px',
};

const fieldGroup = { marginBottom: '16px' };

const sideBySideGrid = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '20px',
  marginBottom: '20px',
};

const stackGap = { display: 'flex', flexDirection: 'column', gap: '20px' };

export default function MenteeHome({ username, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [datasetProfile, setDatasetProfile] = useState(null);
  const [editable, setEditable] = useState({});
  const [mentor, setMentor] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadProfile = async () => {
    const result = await apiGetMyProfile();
    if (result.ok) {
      const { about_me, goals, interests, contact_email, contact_phone, ...rest } = result.profile;
      setDatasetProfile(rest);
      setEditable({ about_me: about_me || '', goals: goals || '', interests: interests || '',
        contact_email: contact_email || '', contact_phone: contact_phone || '' });
      setMentor(result.mentor);
      setSessions(result.sessions || []);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  const loadMessages = async () => {
    const result = await apiGetMessages();
    if (result.ok) setMessages(result.messages);
  };

  useEffect(() => { loadProfile(); loadMessages(); }, []);

  const handleFieldChange = (key, value) => setEditable(prev => ({ ...prev, [key]: value }));

  const handleSave = async (fieldKeys, label) => {
    setSaving(true);
    setSaveMsg('');
    const payload = {};
    fieldKeys.forEach(k => { payload[k] = editable[k]; });
    const result = await apiUpdateMyProfile(payload);
    setSaving(false);
    setSaveMsg(result.ok ? `${label} saved.` : result.error);
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    setSending(true);
    const result = await apiSendMessage(draft.trim());
    setSending(false);
    if (result.ok) {
      setMessages(prev => [...prev, result.message]);
      setDraft('');
    }
  };

  const latestRemark = [...sessions].reverse().find(s => s.remarks);

  return (
    <div className="workspace">
      <header>
        <div className="title-group">
          <h1>Welcome, {username}</h1>
          <p>Your profile, mentor, and messages.</p>
        </div>
        <button className="ghost-btn" onClick={onLogout}>Log out</button>
      </header>

      <main>
        {loading && <p>Loading your profile…</p>}

        {!loading && error && (
          <div style={{ ...box, marginBottom: '20px' }}><p>{error}</p></div>
        )}

        {!loading && !error && (
          <div style={stackGap}>
            <div style={box}>
              <h2 style={{ marginBottom: '8px' }}>{datasetProfile?.Name || username}</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
                {datasetProfile?.Grade && <span>Grade {datasetProfile.Grade} · </span>}
                {datasetProfile?.Section && <span>Section {datasetProfile.Section} · </span>}
                {datasetProfile?.CGPA != null && <span>CGPA {datasetProfile.CGPA}</span>}
              </p>
              {mentor?.name && <p style={{ color: 'var(--text-muted)' }}>Mentor: {mentor.name}</p>}
            </div>

            <div style={sideBySideGrid}>
              <div style={box}>
                <div style={boxTitle}>Personal details</div>
                {EDITABLE_FIELDS.map(f => (
                  <div key={f.key} style={fieldGroup}>
                    <label style={fieldLabel}>{f.label}</label>
                    <input
                      type="text"
                      value={editable[f.key] || ''}
                      placeholder={f.placeholder}
                      onChange={e => handleFieldChange(f.key, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
                <button
                  className="ghost-btn"
                  disabled={saving}
                  onClick={() => handleSave(EDITABLE_FIELDS.map(f => f.key), 'Personal details')}
                >
                  {saving ? 'Saving…' : 'Save details'}
                </button>
              </div>

              <div style={box}>
                <div style={boxTitle}>Contact details</div>
                {CONTACT_FIELDS.map(f => (
                  <div key={f.key} style={fieldGroup}>
                    <label style={fieldLabel}>{f.label}</label>
                    <input
                      type="text"
                      value={editable[f.key] || ''}
                      placeholder={f.placeholder}
                      onChange={e => handleFieldChange(f.key, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
                <button
                  className="ghost-btn"
                  disabled={saving}
                  onClick={() => handleSave(CONTACT_FIELDS.map(f => f.key), 'Contact info')}
                >
                  {saving ? 'Saving…' : 'Save contact info'}
                </button>
              </div>
            </div>

            {saveMsg && <p style={{ color: 'var(--text-muted)' }}>{saveMsg}</p>}

            <div style={sideBySideGrid}>
              <div style={box}>
                <div style={boxTitle}>Mentor's remarks</div>
                {latestRemark ? (
                  <p>{latestRemark.remarks} <em style={{ color: 'var(--text-muted)' }}>(Session {latestRemark.session_number})</em></p>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>No remarks from your mentor yet.</p>
                )}
              </div>

              <div style={box}>
                <div style={boxTitle}>Message {mentor?.name || 'your mentor'}</div>
                <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: '12px' }}>
                  {messages.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No messages yet.</p>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} style={{ marginBottom: '8px' }}>
                        <strong>{m.from === 'mentee' ? 'You' : mentor?.name || 'Mentor'}:</strong> {m.text}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={draft}
                    placeholder="Write a message…"
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                    style={{ flex: 1 }}
                  />
                  <button className="ghost-btn" disabled={sending} onClick={handleSend}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>

            {sessions.length > 0 && (
              <div style={box}>
                <div style={boxTitle}>Session History</div>
                <table>
                  <thead>
                    <tr>
                      <th>Session</th><th>Attendance</th><th>Remarks</th><th>Skills Learned</th><th>Improvements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => (
                      <tr key={i}>
                        <td>{s.session_number}</td>
                        <td>{s.attendance != null ? `${s.attendance}%` : '—'}</td>
                        <td>{s.remarks || '—'}</td>
                        <td>{s.skills_learned || '—'}</td>
                        <td>{s.improvements || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
