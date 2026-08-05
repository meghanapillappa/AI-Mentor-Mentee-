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

from auth import require_auth
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