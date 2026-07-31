"""
routes/db_viewer_routes.py

A read-only window into a database's collections/documents. Deliberately
narrow: only GET endpoints, no way to run an arbitrary query, filter
expression, or write operation — just "list collections" and "page
through a collection's documents as-is". Intended purely for the admin to
visually inspect what's actually stored.
"""
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime

from auth import require_auth

db_viewer_bp = Blueprint("db_viewer_bp", __name__)


def _get_db(workspace_db_name):
    from db import db as control_db, get_workspace_db
    if not workspace_db_name:
        return control_db
    return get_workspace_db(workspace_db_name)


def _json_safe(value):
    """Recursively converts Mongo-native types (ObjectId, datetime) into
    plain strings so the response is safe to jsonify — no code execution
    involved, purely a display-formatting pass."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


@db_viewer_bp.route("/api/db-viewer/collections", methods=["GET"])
@require_auth(role="admin")
def list_collections_route():
    """?workspace=<db_name> — omit for the control database."""
    workspace_db_name = request.args.get("workspace") or None
    target_db = _get_db(workspace_db_name)

    names = []
    for name in target_db.list_collection_names():
        names.append({"name": name, "count": target_db[name].count_documents({})})
    names.sort(key=lambda c: c["name"])
    return jsonify({"collections": names})


@db_viewer_bp.route("/api/db-viewer/directory-as-cohorts", methods=["GET"])
@require_auth(role="admin")
def directory_as_cohorts_route():
    """
    Rebuilds cohort-shaped data { mentor, student_count, average_gpa,
    students[] } straight from a workspace's saved directory documents —
    same shape /api/match returns, so the existing MacroMetrics/
    SearchFilterBar/CohortsGrid components can render it exactly like a
    live match result, instead of the viewer falling back to raw JSON.
    """
    workspace_db_name = request.args.get("workspace")
    if not workspace_db_name:
        return jsonify({"error": "workspace is required"}), 400

    from db import get_workspace_db

    directory_col = get_workspace_db(workspace_db_name)["directory"]
    mentors = list(directory_col.find({"role": "mentor"}))
    mentees_by_username = {
        m["username"]: m for m in directory_col.find({"role": "mentee"})
    }

    cohorts = []
    for mentor in mentors:
        profile = mentor.get("profile", {})
        assigned = profile.get("assigned_mentees", [])

        students = []
        for mentee_username in assigned:
            mentee = mentees_by_username.get(mentee_username)
            if not mentee:
                continue
            mentee_profile = {k: v for k, v in mentee.get("profile", {}).items() if k != "assigned_mentor"}
            mentee_profile["uid"] = mentee_username
            students.append(_json_safe(mentee_profile))

        cgpas = [s.get("CGPA") for s in students if isinstance(s.get("CGPA"), (int, float))]
        average_gpa = round(sum(cgpas) / len(cgpas), 3) if cgpas else 0

        cohorts.append({
            "mentor": profile.get("Name", mentor["username"]),
            "student_count": len(students),
            "average_gpa": average_gpa,
            "students": students,
        })

    cohorts.sort(key=lambda c: c["mentor"])
    return jsonify({"cohorts": cohorts})



@require_auth(role="admin")
def list_documents_route():
    """?workspace=<db_name>&collection=<name>&page=1&limit=20"""
    workspace_db_name = request.args.get("workspace") or None
    collection_name = request.args.get("collection")
    page = max(1, int(request.args.get("page", 1)))
    limit = min(100, max(1, int(request.args.get("limit", 20))))

    if not collection_name:
        return jsonify({"error": "collection is required"}), 400

    target_db = _get_db(workspace_db_name)
    if collection_name not in target_db.list_collection_names():
        return jsonify({"error": f"No collection named '{collection_name}'"}), 404

    col = target_db[collection_name]
    total = col.count_documents({})
    skip = (page - 1) * limit
    docs = [_json_safe(doc) for doc in col.find({}).skip(skip).limit(limit)]

    return jsonify({
        "documents": docs,
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": max(1, (total + limit - 1) // limit),
    })