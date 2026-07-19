import CohortCard from './CohortCard';

export default function CohortsGrid({ matching, matchError, cards, hasRun }) {
  if (!hasRun && !matching) {
    return <div className="roster-grid" />;
  }

  if (matching) {
    return (
      <div className="roster-grid">
        <p className="empty-note">Running stratified balancing algorithm...</p>
      </div>
    );
  }

  if (matchError) {
    return (
      <div className="roster-grid">
        <p style={{ color: 'var(--semantic-amber)', fontSize: 14 }}>
          Connection error: {matchError}. Ensure app.py backend framework is running natively.
        </p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="roster-grid">
        <p className="empty-note">No mentors or students match the current search/filter.</p>
      </div>
    );
  }

  return (
    <div className="roster-grid">
      {cards.map(card => <CohortCard key={card.cohort.mentor} {...card} />)}
    </div>
  );
}
