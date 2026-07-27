import { useEffect, useState } from 'react';
import { apiGetMyDeadlines } from '../lib/api';

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-GB'); // dd/mm/yyyy regardless of browser locale
}

function daysLeftLabel(d) {
  if (d.has_extension && d.is_past) return 'Extension granted';
  if (d.is_past) return 'Overdue';
  if (d.days_left === 0) return 'Due today';
  if (d.days_left === 1) return '1 day left';
  return `${d.days_left} days left`;
}

function urgencyClass(d) {
  if (d.has_extension) return 'ok';
  if (d.is_past) return 'err';
  if (d.days_left <= 2) return 'err';
  if (d.days_left <= 7) return 'warn';
  return 'ok';
}

export default function DeadlineBanner() {
  const [deadlines, setDeadlines] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await apiGetMyDeadlines();
      if (cancelled) return;
      if (result.ok) {
        setDeadlines(result.deadlines);
      } else {
        setError(result.error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error || !deadlines || deadlines.length === 0) return null;

  // Show only the nearest handful, soonest first — already sorted by the backend.
  const upcoming = deadlines.slice(0, 5);

  return (
    <div className="reallocation-banner">
      <div className="reallocation-banner-header">
        <strong>Upcoming session deadlines</strong>
      </div>
      <div className="realloc-student-list">
        {upcoming.map(d => (
          <span
            key={d.session_number}
            className={`realloc-student-chip deadline-chip-${urgencyClass(d)}`}
          >
            Session {d.session_number} — {formatDate(d.deadline)} · {daysLeftLabel(d)}
          </span>
        ))}
      </div>
    </div>
  );
}