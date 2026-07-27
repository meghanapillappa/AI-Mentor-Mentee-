"""
routes/mentee_sessions_routes.py

Lets a mentor record per-session notes for their own mentees: session
number, attendance, remarks, skills learned, and areas to improve. Each
entry is appended to the mentee's user profile under "sessions", so it
rides along with the rest of their profile data and is already returned
by /api/my-cohort without any extra plumbing.
"""
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, g

from auth import require_auth

mentee_sessions_bp = Blueprint("mentee_sessions_bp", __name__)


@mentee_sessions_bp.route("/api/mentee-sessions", methods=["POST"])
@require_auth(role="mentor")
def add_mentee_session_route():
    """
    Body: {
      mentee_username: str,
      session_number: int,
      attendance: number (0-100, cumulative % up to this session),
      remarks: str,
      skills_learned: str,
      improvements: str
    }
    Only allowed if the mentee is actually assigned to the requesting mentor.

    Mentor/mentee accounts live in their own workspace's "directory"
    collection (not the control database's users_col) — the session
    remembers which workspace this account came from, set at login time.
    """
    try:
        from db import get_workspace_db

        data = request.get_json(silent=True) or {}
        mentee_username = (data.get("mentee_username") or "").strip()
        if not mentee_username:
            return jsonify({"error": "mentee_username is required"}), 400

        mentor_username = g.session["username"]
        workspace_db_name = g.session.get("workspace_db")
        if not workspace_db_name:
            return jsonify({"error": "This account isn't linked to a saved workspace."}), 404

        directory_col = get_workspace_db(workspace_db_name)["directory"]

        mentor_doc = directory_col.find_one({"username": mentor_username, "role": "mentor"})
        if not mentor_doc:
            return jsonify({"error": "Mentor profile not found"}), 404

        assigned = mentor_doc.get("profile", {}).get("assigned_mentees", [])
        if mentee_username not in assigned:
            return jsonify({"error": "This mentee is not assigned to you"}), 403

        session_entry = {
            "session_number": data.get("session_number"),
            "attendance": data.get("attendance"),
            "remarks": (data.get("remarks") or "").strip(),
            "skills_learned": (data.get("skills_learned") or "").strip(),
            "improvements": (data.get("improvements") or "").strip(),
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "recorded_by": mentor_username,
        }

        result = directory_col.update_one(
            {"username": mentee_username, "role": "mentee"},
            {"$push": {"profile.sessions": session_entry}},
        )
        if result.matched_count == 0:
            return jsonify({"error": "Mentee account not found"}), 404

        return jsonify({"message": "Session recorded", "session": session_entry})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
