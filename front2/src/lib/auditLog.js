// ---------------------------------------------------------------------------
// auditLog.js
//
// Pure helper for building audit log entries. Normalizes the two different
// raw backend payload shapes — add: { new_mentor, students_pulled, sources },
// remove: { removed_mentor, students_reassigned, redistribution } — into one
// common event shape the AuditLog component can render regardless of type.
// ---------------------------------------------------------------------------

export function buildAuditEvent(type, data, idSeed) {
  const isAdd = type === 'add';
  return {
    id: 'audit' + idSeed,
    type,
    mentor: isAdd ? data.new_mentor : data.removed_mentor,
    count: isAdd ? data.students_pulled : data.students_reassigned,
    breakdown: (isAdd ? data.sources : data.redistribution) || [],
    timestamp: new Date(),
  };
}
