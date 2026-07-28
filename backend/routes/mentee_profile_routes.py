"""
routes/mentee_profile_routes.py

Two things a mentee needs beyond their read-only cohort/profile view:

1. A small set of self-editable profile fields (about_me, goals, interests,
   contact_email, contact_phone) — separate from the uploaded dataset
   fields (Name/CGPA/Section/etc.), which stay admin/upload-owned and are
   never touched here.

2. A lightweight message thread between a mentee and their assigned
   mentor. Stored per-workspace as one document per (mentor, mentee) pair
   in a "messages" collection, with an appended list of {from, text, at}.

Both mentors and mentees can hit these — the pairing is resolved from
whichever side is logged in, always scoped to the mentee's own mentor
(never a mentor's whole cohort at once).
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g

from auth import require_auth

mentee_profile_bp = Blueprint("mentee_profile_bp", __name__)

EDITABLE_PROFILE_FIELDS = {"about_me", "goals", "interests", "contact_email", "contact_phone"}


def _directory_col(workspace_db_name):
    from db import get_workspace_db
    return get_workspace_db(workspace_db_name)["directory"]


def _messages_col(workspace_db_name):
    from db import get_workspace_db
    return get_workspace_db(workspace_db_name)["messages"]


@mentee_profile_bp.route("/api/my-profile", methods=["PATCH"])
@require_auth(role="mentee")
def update_my_profile_route():
    """
    Body: any subset of { about_me, goals, interests, contact_email, contact_phone }
    Unknown/uploaded-dataset fields (Name, CGPA, etc.) are silently ignored —
    this endpoint only ever touches the mentee's own self-service fields.
    """
    username = g.session["username"]
    workspace_db_name = g.session.get("workspace_db")
    if not workspace_db_name:
        return jsonify({"error": "This account isn't linked to a saved workspace."}), 404

    data = request.get_json(silent=True) or {}
    updates = {f"profile.{k}": (v or "").strip() if isinstance(v, str) else v
               for k, v in data.items() if k in EDITABLE_PROFILE_FIELDS}

    if not updates:
        return jsonify({"error": f"No editable fields provided. Allowed: {sorted(EDITABLE_PROFILE_FIELDS)}"}), 400

    col = _directory_col(workspace_db_name)
    result = col.update_one({"username": username, "role": "mentee"}, {"$set": updates})
    if result.matched_count == 0:
        return jsonify({"error": "Mentee account not found"}), 404

    updated = col.find_one({"username": username, "role": "mentee"}, {"_id": 0, "profile": 1})
    return jsonify({"profile": updated.get("profile", {})})


def _resolve_thread_partner(directory_col):
    """
    Given the logged-in session (mentor or mentee), figures out the other
    party of their 1:1 thread. Returns (mentee_username, mentor_username) or
    (None, None, error_message) on failure.
    """
    role = g.session["role"]
    username = g.session["username"]

    if role == "mentee":
        mentee_doc = directory_col.find_one({"username": username, "role": "mentee"})
        if not mentee_doc:
            return None, None, "Mentee account not found"
        mentor_name = mentee_doc.get("profile", {}).get("assigned_mentor")
        if not mentor_name:
            return None, None, "No mentor assigned yet"
        mentor_doc = directory_col.find_one({"role": "mentor", "profile.Name": mentor_name})
        if not mentor_doc:
            return None, None, "Assigned mentor account not found"
        return username, mentor_doc["username"], None

    if role == "mentor":
        # Mentor must specify which mentee thread they want.
        mentee_username = request.args.get("mentee_username") or (request.get_json(silent=True) or {}).get("mentee_username")
        if not mentee_username:
            return None, None, "mentee_username is required"
        mentor_doc = directory_col.find_one({"username": username, "role": "mentor"})
        if not mentor_doc:
            return None, None, "Mentor account not found"
        assigned = mentor_doc.get("profile", {}).get("assigned_mentees", [])
        if mentee_username not in assigned:
            return None, None, "This mentee is not assigned to you"
        return mentee_username, username, None

    return None, None, "Only mentors and mentees have message threads"


@mentee_profile_bp.route("/api/messages", methods=["GET"])
@require_auth()
def get_messages_route():
    workspace_db_name = g.session.get("workspace_db")
    if not workspace_db_name:
        return jsonify({"error": "This account isn't linked to a saved workspace."}), 404

    directory_col = _directory_col(workspace_db_name)
    mentee_username, mentor_username, err = _resolve_thread_partner(directory_col)
    if err:
        return jsonify({"error": err}), 404

    thread = _messages_col(workspace_db_name).find_one(
        {"mentee_username": mentee_username, "mentor_username": mentor_username},
        {"_id": 0},
    )
    return jsonify({"messages": (thread or {}).get("messages", []),
                     "mentee_username": mentee_username,
                     "mentor_username": mentor_username})


@mentee_profile_bp.route("/api/messages", methods=["POST"])
@require_auth()
def send_message_route():
    """Body: { text } for mentees; { mentee_username, text } for mentors."""
    workspace_db_name = g.session.get("workspace_db")
    if not workspace_db_name:
        return jsonify({"error": "This account isn't linked to a saved workspace."}), 404

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    directory_col = _directory_col(workspace_db_name)
    mentee_username, mentor_username, err = _resolve_thread_partner(directory_col)
    if err:
        return jsonify({"error": err}), 404

    message = {
        "from": g.session["role"],
        "from_username": g.session["username"],
        "text": text,
        "at": datetime.now(timezone.utc).isoformat(),
    }

    _messages_col(workspace_db_name).update_one(
        {"mentee_username": mentee_username, "mentor_username": mentor_username},
        {"$push": {"messages": message}, "$setOnInsert": {
            "mentee_username": mentee_username, "mentor_username": mentor_username}},
        upsert=True,
    )
    return jsonify({"message": message})
