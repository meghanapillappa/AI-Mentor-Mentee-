export default function MacroMetrics({ cohorts }) {
  const totalStudents = cohorts.reduce((sum, c) => sum + c.student_count, 0);
  const allAverages = cohorts.map(c => c.average_gpa);
  const globalAvg = allAverages.reduce((a, b) => a + b, 0) / allAverages.length;
  const maxAvg = Math.max(...allAverages);
  const minAvg = Math.min(...allAverages);
  const spreadVariance = maxAvg - minAvg;

  return (
    <div className="macro-metrics-bar">
      <div className="metric-tile">
        <div className="metric-label">Total Allocated Students</div>
        <div className="metric-value">{totalStudents}</div>
      </div>
      <div className="metric-tile">
        <div className="metric-label">Assigned Mentors</div>
        <div className="metric-value">{cohorts.length}</div>
      </div>
      <div className="metric-tile">
        <div className="metric-label">Global Batch GPA Avg</div>
        <div className="metric-value">{globalAvg.toFixed(3)}</div>
      </div>
      <div className="metric-tile">
        <div className="metric-label">Cohort Variance Spread</div>
        <div className="metric-value" style={{ color: 'var(--semantic-green)' }}>
          &plusmn; {spreadVariance.toFixed(3)}
        </div>
      </div>
    </div>
  );
}
