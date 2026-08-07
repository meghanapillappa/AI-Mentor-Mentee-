"""
routes/workspace_routes.py

A "workspace" is one real MongoDB database dedicated to a single
dataset/match — its own mentor/mentee directory, fully isolated from every
other workspace. The registry of which workspaces exist lives in the
control database (db.workspaces_col); the actual mentor/mentee data for
each one lives in that workspace's own separate database.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from auth import require_auth, sync_workspace_directory
from db import workspaces_col, slugify_workspace_name, get_workspace_db

workspace_bp = Blueprint("workspace_bp", __name__)


@workspace_bp.route("/api/workspaces", methods=["GET"])
@require_auth(role=["admin", "viewer"])
def list_workspaces_route():
    workspaces = []
    for ws in workspaces_col.find({}, {"_id": 0}):
        directory_col = get_workspace_db(ws["db_name"])["directory"]
        mentor_count = directory_col.count_documents({"role": "mentor"})
        mentee_count = directory_col.count_documents({"role": "mentee"})
        workspaces.append({**ws, "mentor_count": mentor_count, "mentee_count": mentee_count})

    workspaces.sort(key=lambda w: w.get("created_at", ""), reverse=True)
    return jsonify({"workspaces": workspaces})


@workspace_bp.route("/api/workspaces", methods=["POST"])
@require_auth(role="admin")
def create_workspace_route():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Workspace name is required"}), 400

    slug = slugify_workspace_name(name)
    db_name = f"mm_{slug}"

    existing = workspaces_col.find_one({"db_name": db_name}, {"_id": 0})
    if existing:
        # Re-using the same name is fine — just hand back the existing one
        # instead of erroring, so "create" is safely idempotent.
        return jsonify(existing)

    record = {
        "name": name,
        "db_name": db_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    workspaces_col.insert_one(dict(record))
    return jsonify(record)


@workspace_bp.route("/api/workspaces/<db_name>", methods=["DELETE"])
@require_auth(role="admin")
def delete_workspace_route(db_name):
    """
    Drops an entire workspace database and removes it from the registry.
    This is a hard, irreversible delete of every mentor/mentee account
    that workspace ever had.
    """
    data = request.get_json(silent=True) or {}
    if not data.get("confirm"):
        return jsonify({"error": "Pass { confirm: true } to proceed with deletion."}), 400

    existing = workspaces_col.find_one({"db_name": db_name})
    if not existing:
        return jsonify({"error": f"No workspace found for '{db_name}'"}), 404

    get_workspace_db(db_name).client.drop_database(db_name)
    workspaces_col.delete_one({"db_name": db_name})
    return jsonify({"deleted": db_name})


@workspace_bp.route("/api/save-workspace", methods=["POST"])
@require_auth(role="admin")
def save_workspace_route():
    """
    Saves or updates cohort match assignments inside a workspace database.
    Deletes old/removed mentors and returns updated status feedback.
    """
    data = request.get_json(silent=True) or {}
    workspace_name = (data.get("workspace_name") or "").strip()
    cohorts = data.get("cohorts", [])

    if not workspace_name:
        return jsonify({"error": "Workspace name is required"}), 400
    if not cohorts:
        return jsonify({"error": "No cohorts provided to save"}), 400

    slug = slugify_workspace_name(workspace_name)
    db_name = f"mm_{slug}"

    # Ensure workspace is registered in control database
    existing = workspaces_col.find_one({"db_name": db_name})
    if not existing:
        record = {
            "name": workspace_name,
            "db_name": db_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        workspaces_col.insert_one(record)

    # Sync directory (upsert active users, delete removed ones)
    sync_res = sync_workspace_directory(db_name, cohorts)

    # Build response message
    msg_parts = []
    if sync_res["created_count"] > 0:
        msg_parts.append(f"Created {sync_res['created_count']} new account(s)")
    if sync_res["updated_count"] > 0:
        msg_parts.append(f"Updated {sync_res['updated_count']} existing assignment(s)")
    if sync_res["removed_count"] > 0:
        msg_parts.append(f"Removed {sync_res['removed_count']} deleted account(s)")

    message = ", ".join(msg_parts) if msg_parts else "No changes detected."

    return jsonify({
        "ok": True,
        "workspace_db": db_name,
        "message": message,
        "created_count": sync_res["created_count"],
        "updated_count": sync_res["updated_count"],
        "removed_count": sync_res["removed_count"],
        "passwords": sync_res["passwords"],
    })


@workspace_bp.route("/api/workspaces/<db_name>/load", methods=["GET"])
@require_auth(role="admin")
def load_workspace_route(db_name):
    from db import get_workspace_db
    from routes.save_directory_routes import _find_field, NAME_CANDIDATES
    
    db = get_workspace_db(db_name)
    directory = list(db["directory"].find({}, {"_id": 0}))
    
    mentors_raw = [doc for doc in directory if doc.get("role") == "mentor"]
    mentees_by_username = {doc["username"]: doc for doc in directory if doc.get("role") == "mentee"}
    
    mentors = []
    cohorts = []
    
    for m_doc in mentors_raw:
        m_profile = m_doc.get("profile", {}).copy()
        
        # 1. Provide the stable UID for the frontend tables so reallocation works
        m_profile["_uid"] = m_doc["username"]
        
        # 2. Extract the exact Mentor Name regardless of column headers
        cohort_mentor_name = _find_field(m_profile, NAME_CANDIDATES) or m_doc["username"]
        
        # 3. Clean up internal routing fields before populating the Editable Table
        m_profile.pop("assigned_mentees", None)
        m_profile.pop("mentee_count", None)
        mentors.append(m_profile)
        
        # 4. Build the cohort roster
        assigned = m_doc.get("profile", {}).get("assigned_mentees", [])
        students = []
        for mentee_username in assigned:
            mentee = mentees_by_username.get(mentee_username)
            if not mentee: 
                continue
            
            s_prof = mentee.get("profile", {}).copy()
            s_prof.pop("assigned_mentor", None)
            s_prof.pop("sessions", None)
            s_prof["uid"] = mentee_username # Required for frontend rebalancing
            students.append(s_prof)
        
        # Calculate stats
        cgpas = [float(s.get("CGPA")) for s in students if s.get("CGPA") not in (None, "")]
        avg_gpa = round(sum(cgpas) / len(cgpas), 3) if cgpas else 0
        
        cohorts.append({
            "mentor": cohort_mentor_name,
            "student_count": len(students),
            "average_gpa": avg_gpa,
            "students": students
        })

    mentees = []
    for s_doc in mentees_by_username.values():
        s_profile = s_doc.get("profile", {}).copy()
        s_profile.pop("assigned_mentor", None)
        s_profile.pop("sessions", None)
        s_profile["_uid"] = s_doc["username"]
        mentees.append(s_profile)
        
    audit_log = []
    if "audit_log" in db.list_collection_names():
        audit_log = list(db["audit_log"].find({}, {"_id": 0}))

    return jsonify({
        "mentors": mentors,
        "mentees": mentees,
        "cohorts": cohorts,
        "audit_log": audit_log
    })