export const DEFAULT_FILTERS = {
  search: '',
  mentor: '',
  grade: '',
  section: '',
  cgpaMin: '',
  cgpaMax: '',
  viewLimitEnabled: false,
  viewLimitValue: 10,
};

export default function SearchFilterBar({
  filters,
  setFilters,
  mentorOptions,
  sectionOptions,
  maxCohortSize,
  resultLabel,
  hasReallocation,
  onToggleRealloc,
}) {
  const update = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const clear = () => setFilters(prev => ({ ...DEFAULT_FILTERS, viewLimitValue: prev.viewLimitValue }));

  return (
    <div className="search-filter-bar" style={{ display: 'flex' }}>
      <div className="filter-field grow">
        <label>Search student or mentor</label>
        <input
          type="text"
          placeholder="Type a name to find a student or mentor..."
          value={filters.search}
          onChange={(e) => update('search', e.target.value)}
        />
      </div>

      <div className="filter-field">
        <label>Mentor</label>
        <select value={filters.mentor} onChange={(e) => update('mentor', e.target.value)}>
          <option value="">All mentors</option>
          {mentorOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="filter-field">
        <label>Grade</label>
        <select value={filters.grade} onChange={(e) => update('grade', e.target.value)}>
          <option value="">All grades</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>

      <div className="filter-field">
        <label>Section</label>
        <select value={filters.section} onChange={(e) => update('section', e.target.value)}>
          <option value="">All sections</option>
          {sectionOptions.map(s => <option key={s} value={s}>Section {s}</option>)}
        </select>
      </div>

      <div className="filter-field cgpa-range-field">
        <label>CGPA range</label>
        <div className="cgpa-range-inputs">
          <input
            type="number"
            min="0"
            max="10"
            step="0.01"
            placeholder="0.00"
            value={filters.cgpaMin}
            onChange={(e) => update('cgpaMin', e.target.value)}
          />
          <span>to</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.01"
            placeholder="10.00"
            value={filters.cgpaMax}
            onChange={(e) => update('cgpaMax', e.target.value)}
          />
        </div>
      </div>

      <div className="filter-field view-limit-field">
        <label>View limit per mentor</label>
        <div className="view-limit-controls">
          <input
            type="range"
            min="1"
            max={Math.max(1, maxCohortSize)}
            step="1"
            disabled={!filters.viewLimitEnabled}
            value={filters.viewLimitValue}
            onChange={(e) => update('viewLimitValue', e.target.value)}
          />
          <input
            type="number"
            min="1"
            max={Math.max(1, maxCohortSize)}
            placeholder="All"
            disabled={!filters.viewLimitEnabled}
            value={filters.viewLimitValue}
            onChange={(e) => update('viewLimitValue', e.target.value)}
          />
        </div>
        <label className="view-limit-toggle">
          <input
            type="checkbox"
            checked={filters.viewLimitEnabled}
            onChange={(e) => update('viewLimitEnabled', e.target.checked)}
          />{' '}
          Limit shown mentees per card
        </label>
      </div>

      {hasReallocation && (
        <button className="ghost-btn" onClick={onToggleRealloc}>Reallocation report</button>
      )}

      <button className="filter-clear" onClick={clear}>Clear filters</button>

      <div className="filter-result-count">{resultLabel}</div>
    </div>
  );
}
