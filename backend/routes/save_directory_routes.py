
"""
routes/save_directory_routes.py

Persists a completed match into MongoDB: every mentor and every mentee
becomes (or updates) a user account, tagged with role "mentor" or
"mentee" respectively, carrying their original file data as a profile
plus their current assignment (who they're mentoring / who mentors them).

Column names in uploaded files vary a lot (Student ID / USN / Reg No /
student_id / ...), so username extraction is case- and
punctuation-insensitive, and always falls back to *something* usable
rather than silently skipping a row.
"""
import re

from flask import Blueprint, request, jsonify

from auth import require_auth, upsert_directory_user

save_directory_bp = Blueprint("save_directory_bp", __name__)


def _normalize_key(k):
    return re.sub(r"[^a-z0-9]", "", str(k).lower())


def _find_field(row, candidates):
    """Case/punctuation-insensitive lookup across a row's actual keys."""
    normalized_map = {_normalize_key(k): v for k, v in row.items()}
    for candidate in candidates:
        val = normalized_map.get(_normalize_key(candidate))
        if val not in (None, ""):
            return val
    return None


def _sanitize_username(raw):
    slug = re.sub(r"[^a-z0-9]+", "-", str(raw).strip().lower()).strip("-")
    return slug or None


ID_CANDIDATES = ["Student ID", "StudentID", "USN", "Roll Number", "Roll No", "Reg No", "Register Number", "ID", "Mentor ID", "MentorID", "Employee ID", "Faculty ID"]
NAME_CANDIDATES = ["Name", "Student Name", "Mentor", "Mentor Name", "Faculty", "Guide", "Teacher"]


def _extract_username(row, fallback_prefix, fallback_index):
    """
    Tries an ID-like column first, then a name-like column (sanitized),
    then guarantees SOMETHING so a row is never silently dropped.
    """
    id_val = _find_field(row, ID_CANDIDATES)
    if id_val:
        return str(id_val).strip()

    name_val = _find_field(row, NAME_CANDIDATES)
    if name_val:
        slug = _sanitize_username(name_val)
        if slug:
            return slug

    # Last resort: guarantees every row gets saved, even with no
    # identifiable ID/name column at all.
    return f"{fallback_prefix}-{fallback_index}"


def _display_name(row, fallback_username):
    return _find_field(row, NAME_CANDIDATES) or fallback_username


@save_directory_bp.route("/api/save-match-to-db", methods=["POST"])
@require_auth(role="admin")
def save_match_to_db_route():
    """
    Body: { mentors: [<raw mentor rows>], cohorts: [<match result>] }
    """
    try:
        data = request.get_json(silent=True) or {}
        mentors = data.get("mentors", [])
        cohorts = data.get("cohorts", [])

        if not cohorts:
            return jsonify({"error": "No match results to save. Run a match first."}), 400

        mentor_rows_by_name = {}
        for row in mentors:
            name = _find_field(row, NAME_CANDIDATES)
            if name:
                mentor_rows_by_name[name] = row

        created_accounts = []
        mentors_saved = 0
        mentees_saved = 0

        for m_idx, cohort in enumerate(cohorts):
            mentor_name = cohort.get("mentor")
            mentor_row = mentor_rows_by_name.get(mentor_name, {"Name": mentor_name})
            mentor_username = _extract_username(mentor_row, "mentor", m_idx)

            student_ids = []
            for s_idx, student in enumerate(cohort.get("students", [])):
                student_username = _extract_username(student, f"mentee-{m_idx}", s_idx)

                student_profile = {k: v for k, v in student.items() if k != "uid"}
                student_profile["assigned_mentor"] = mentor_name

                result = upsert_directory_user(student_username, "mentee", student_profile)
                mentees_saved += 1
                if result["created"]:
                    created_accounts.append({**result, "name": _display_name(student, student_username)})

                student_ids.append(student_username)

            mentor_profile = {k: v for k, v in mentor_row.items() if not str(k).startswith("_")}
            mentor_profile["assigned_mentees"] = student_ids
            mentor_profile["mentee_count"] = cohort.get("student_count", len(student_ids))

            result = upsert_directory_user(mentor_username, "mentor", mentor_profile)
            mentors_saved += 1
            if result["created"]:
                created_accounts.append({**result, "name": _display_name(mentor_row, mentor_username)})

        return jsonify({
            "mentors_saved": mentors_saved,
            "mentees_saved": mentees_saved,
            "created_accounts": created_accounts,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@save_directory_bp.route("/api/directory-accounts", methods=["DELETE"])
@require_auth(role="admin")
def clear_directory_accounts_route():
    """
    Body (optional): { "confirm": true } — required to actually proceed.
    """
    try:
        from db import users_col

        data = request.get_json(silent=True) or {}
        if not data.get("confirm"):
            return jsonify({"error": "Pass { confirm: true } to proceed with deletion."}), 400

        result = users_col.delete_many({"role": {"$in": ["mentor", "mentee"]}})
        return jsonify({"deleted_count": result.deleted_count})

    except Exception as e:
        return jsonify({"error": str(e)}), 500