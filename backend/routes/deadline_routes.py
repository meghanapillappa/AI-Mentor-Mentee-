"""
routes/deadline_routes.py

Admin-configured deadlines, one per mentoring session number (e.g. "Session 1
due 27/08/2026"), scoped to a single workspace database — different
datasets can have entirely different deadline schedules.

Each deadline document also carries an `extensions` list of mentor
usernames who are allowed to submit past the deadline for that specific
session, granted individually by an admin.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

from auth import require_auth

deadline_bp = Blueprint("deadline_bp", __name__)


def _deadlines_col(workspace_db_name):
    from db import get_workspace_db
    return get_workspace_db(workspace_db_name)["deadlines"]


@deadline_bp.route("/api/deadlines", methods=["GET"])
@require_auth(role=["admin", "viewer"])
def list_deadlines_route():
    workspace_db_name = request.args.get("workspace")
    if not workspace_db_name:
        return jsonify({"error": "workspace is required"}), 400

    col = _deadlines_col(workspace_db_name)
    deadlines = list(col.find({}, {"_id": 0}))
    deadlines.sort(key=lambda d: d.get("session_number", 0))
    return jsonify({"deadlines": deadlines})


@deadline_bp.route("/api/deadlines", methods=["POST"])
@require_auth(role="admin")
def set_deadline_route():
    """
    Body: { workspace, session_number, deadline }
    `deadline` is an ISO date/datetime string, e.g. "2026-08-27" or
    "2026-08-27T23:59:00". Creates the session's deadline entry if it
    doesn't exist yet, or updates the date if it does — extensions already
    granted for that session are left untouched.
    """
    data = request.get_json(silent=True) or {}
    workspace_db_name = data.get("workspace")
    session_number = data.get("session_number")
    deadline = data.get("deadline")

    if not workspace_db_name:
        return jsonify({"error": "workspace is required"}), 400
    if session_number is None:
        return jsonify({"error": "session_number is required"}), 400
    if not deadline:
        return jsonify({"error": "deadline is required"}), 400

    try:
        datetime.fromisoformat(deadline)
    except ValueError:
        return jsonify({"error": "deadline must be a valid ISO date, e.g. 2026-08-27"}), 400

    col = _deadlines_col(workspace_db_name)
    col.update_one(
        {"session_number": session_number},
        {"$set": {"deadline": deadline}, "$setOnInsert": {"extensions": []}},
        upsert=True,
    )
    updated = col.find_one({"session_number": session_number}, {"_id": 0})
    return jsonify(updated)


@deadline_bp.route("/api/deadlines/<int:session_number>", methods=["DELETE"])
@require_auth(role="admin")
def delete_deadline_route(session_number):
    workspace_db_name = request.args.get("workspace")
    if not workspace_db_name:
        return jsonify({"error": "workspace is required"}), 400

    col = _deadlines_col(workspace_db_name)
    col.delete_one({"session_number": session_number})
    return jsonify({"deleted": session_number})


@deadline_bp.route("/api/deadlines/extend", methods=["POST"])
@require_auth(role="admin")
def grant_extension_route():
    """Body: { workspace, session_number, mentor_username } — lets that
    mentor submit session data past the deadline for that session only."""
    data = request.get_json(silent=True) or {}
    workspace_db_name = data.get("workspace")
    session_number = data.get("session_number")
    mentor_username = (data.get("mentor_username") or "").strip()

    if not workspace_db_name or session_number is None or not mentor_username:
        return jsonify({"error": "workspace, session_number, and mentor_username are all required"}), 400

    col = _deadlines_col(workspace_db_name)
    col.update_one(
        {"session_number": session_number},
        {"$addToSet": {"extensions": mentor_username}, "$setOnInsert": {"deadline": None}},
        upsert=True,
    )
    updated = col.find_one({"session_number": session_number}, {"_id": 0})
    return jsonify(updated)


@deadline_bp.route("/api/deadlines/extend", methods=["DELETE"])
@require_auth(role="admin")
def revoke_extension_route():
    """Body: { workspace, session_number, mentor_username }"""
    data = request.get_json(silent=True) or {}
    workspace_db_name = data.get("workspace")
    session_number = data.get("session_number")
    mentor_username = (data.get("mentor_username") or "").strip()

    if not workspace_db_name or session_number is None or not mentor_username:
        return jsonify({"error": "workspace, session_number, and mentor_username are all required"}), 400

    col = _deadlines_col(workspace_db_name)
    col.update_one(
        {"session_number": session_number},
        {"$pull": {"extensions": mentor_username}},
    )
    updated = col.find_one({"session_number": session_number}, {"_id": 0})
    return jsonify(updated)


def check_session_deadline(workspace_db_name, session_number, mentor_username):
    """
    Shared helper called from add_mentee_session_route. Returns None if the
    mentor is clear to submit, or an error string if they're blocked.
    """
    col = _deadlines_col(workspace_db_name)
    doc = col.find_one({"session_number": session_number})
    if not doc or not doc.get("deadline"):
        return None  # no deadline configured for this session — always allowed

    deadline_dt = datetime.fromisoformat(doc["deadline"])
    if deadline_dt.tzinfo is None:
        deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) <= deadline_dt:
        return None  # still before the deadline

    if mentor_username in doc.get("extensions", []):
        return None  # this mentor was granted a specific extension

    return f"The deadline for session {session_number} has passed. Contact an admin for an extension."


@deadline_bp.route("/api/deadlines/overdue-mentors", methods=["GET"])
@require_auth(role=["admin", "viewer"])
def overdue_mentors_route():
    """
    For every session with a deadline that has passed, finds every mentor
    in the given workspace who has NOT submitted a session entry for that
    session number and does NOT have a personal extension — i.e. mentors
    who are actually in violation right now.
    """
    from db import get_workspace_db

    workspace_db_name = request.args.get("workspace")
    if not workspace_db_name:
        return jsonify({"error": "workspace is required"}), 400

    now = datetime.now(timezone.utc)
    deadlines_col = _deadlines_col(workspace_db_name)
    directory_col = get_workspace_db(workspace_db_name)["directory"]

    passed_deadlines = []
    for d in deadlines_col.find({}):
        if not d.get("deadline"):
            continue
        deadline_dt = datetime.fromisoformat(d["deadline"])
        if deadline_dt.tzinfo is None:
            deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
        if deadline_dt < now:
            passed_deadlines.append(d)

    mentors = list(directory_col.find({"role": "mentor"}, {"_id": 0}))

    overdue = []
    for d in passed_deadlines:
        session_number = d["session_number"]
        extensions = set(d.get("extensions", []))

        for mentor in mentors:
            if mentor["username"] in extensions:
                continue  # exempted for this session

            assigned_mentees = mentor.get("profile", {}).get("assigned_mentees", [])
            if not assigned_mentees:
                continue  # nothing to be overdue on

            missing_mentees = []
            for mentee_username in assigned_mentees:
                mentee_doc = directory_col.find_one(
                    {"username": mentee_username, "role": "mentee"},
                    {"profile.sessions": 1},
                )
                sessions_filled = {
                    s.get("session_number")
                    for s in (mentee_doc or {}).get("profile", {}).get("sessions", [])
                }
                if session_number not in sessions_filled:
                    missing_mentees.append(mentee_username)

            if missing_mentees:
                overdue.append({
                    "mentor_username": mentor["username"],
                    "mentor_name": mentor.get("profile", {}).get("Name", mentor["username"]),
                    "session_number": session_number,
                    "deadline": d["deadline"],
                    "missing_count": len(missing_mentees),
                    "total_mentees": len(assigned_mentees),
                })

    overdue.sort(key=lambda o: (o["session_number"], o["mentor_name"]))
    return jsonify({"overdue": overdue})

@deadline_bp.route("/api/my-deadlines", methods=["GET"])
@require_auth()
def my_deadlines_route():
    """
    Mentor/mentee self-service view of their own workspace's deadlines —
    used to render the "X days left" banner. Any logged-in mentor or
    mentee sees the same list; whether *they specifically* are exempt from
    a passed one (via an extension) is included per-entry so the banner
    can say "you have an extension" instead of "overdue" where relevant.
    """
    from flask import g

    workspace_db_name = g.session.get("workspace_db")
    username = g.session["username"]

    if not workspace_db_name:
        return jsonify({"deadlines": []})

    col = _deadlines_col(workspace_db_name)
    deadlines = list(col.find({}, {"_id": 0}))

    now = datetime.now(timezone.utc)
    enriched = []
    for d in deadlines:
        if not d.get("deadline"):
            continue
        deadline_dt = datetime.fromisoformat(d["deadline"])
        if deadline_dt.tzinfo is None:
            deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)

        days_left = (deadline_dt.date() - now.date()).days
        enriched.append({
            "session_number": d["session_number"],
            "deadline": d["deadline"],
            "days_left": days_left,
            "is_past": deadline_dt < now,
            "has_extension": username in d.get("extensions", []),
        })

    enriched.sort(key=lambda d: d["deadline"])
    return jsonify({"deadlines": enriched})