import AuditLog from './AuditLog';
import NewCredentialsModal from './NewCredentialsModal';
import WorkspaceSelector from './WorkspaceSelector';

export default function Sidebar({ engine,activeWorkspace, setActiveWorkspace }) {
  return (
    <aside className="sidebar-panel">
      <div className="panel-section-title">Configuration</div>

      <div className="upload-group">
        <label>Combined Dataset (Excel / SQL)</label>
        <input
          type="file"
          className="custom-file-input"
          accept=".csv,.txt,.xlsx,.xls,.sql"
          onChange={(e) => engine.handleCombinedFile(e.target.files[0])}
        />
        <small>
          Upload a workbook containing both Mentors and Mentees, or a SQL dump
          containing both tables.
        </small>
        <div className={`status-line${engine.combinedStatus.kind ? ' ' + engine.combinedStatus.kind : ''}`}>
          {engine.combinedStatus.text}
        </div>
      </div>

      <div className="upload-group">
        <label>Mentors Roster</label>
        <input
          type="file"
          className="custom-file-input"
          accept=".csv,.txt,.xlsx,.xls,.sql"
          onChange={(e) => engine.handleMentorsFile(e.target.files[0])}
        />
        <small>Accepts .csv, .txt, .xlsx, .xls, or .sql</small>
        <div className={`status-line${engine.mentorsStatus.kind ? ' ' + engine.mentorsStatus.kind : ''}`}>
          {engine.mentorsStatus.text}
        </div>
      </div>

      <div className="upload-group">
        <label>Mentees Master Database</label>
        <input
          type="file"
          className="custom-file-input"
          accept=".csv,.txt,.xlsx,.xls,.sql"
          onChange={(e) => engine.handleStudentsFile(e.target.files[0])}
        />
        <small>Accepts .csv, .txt, .xlsx, .xls, or .sql — any column names/order are auto-mapped to Student ID / Name / Section / CGPA</small>
        <div className={`status-line${engine.studentsStatus.kind ? ' ' + engine.studentsStatus.kind : ''}`}>
          {engine.studentsStatus.text}
        </div>
      </div>

      <button
        className="action-btn"
        disabled={!engine.matchReady || engine.matching}
        onClick={engine.runMatch}
      >
        {engine.matching ? 'Running…' : 'Execute Balancing'}
      </button>

      <button
        className="ghost-btn"
        disabled={engine.lastCohorts.length === 0 || engine.savingToDb || !activeWorkspace}
        onClick={() => engine.saveMatchToDb(activeWorkspace?.db_name)}
      >
        {engine.savingToDb ? 'Saving…' : `Save Match to "${activeWorkspace?.name || '…'}"`}
      </button>
      {engine.saveDbError && <div className="status-line err">{engine.saveDbError}</div>}

      <button
        className="ghost-btn"
        disabled={engine.clearingDb || !activeWorkspace}
        onClick={() => {
          if (window.confirm(`Delete every mentor/mentee account in "${activeWorkspace?.name}"? Admin accounts are unaffected.`)) {
            engine.clearDirectoryAccounts(activeWorkspace?.db_name);
          }
        }}
      >
        {engine.clearingDb ? 'Clearing…' : `Clear "${activeWorkspace?.name || '…'}"`}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <WorkspaceSelector activeWorkspace={activeWorkspace} onSelect={setActiveWorkspace} />
        <button 
          className="ghost-btn" 
          disabled={!activeWorkspace}
          onClick={() => {
            if (window.confirm(`Loading "${activeWorkspace?.name}" will overwrite your current unsaved editor data. Continue?`)) {
              engine.loadWorkspace(activeWorkspace.db_name);
            }
          }}
        >
          Load Workspace into Engine
        </button>
      </div>

      <AuditLog entries={engine.auditLogEntries} />
    </aside>
  );
}
