import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash

SESSION_TTL_HOURS = 12


# ---------------------------------------------------------------------------
# Admin login accounts (control database — db.users_col)
# ---------------------------------------------------------------------------

def create_user(username, password, role="user"):
    """Used by the seed script to create the admin account (or any login
    account that should live in the control database)."""
    from db import users_col

    if users_col.find_one({"username": username}):
        raise ValueError(f"User '{username}' already exists")
    users_col.insert_one({
        "username": username,
        "password_hash": generate_password_hash(password),
        "role": role,
        "created_at": datetime.now(timezone.utc),
    })


def _password_matches(user, password):
    """
    Mentor/mentee accounts can have two valid passwords at once: the
    original random one generated at creation (password_hash), and an
    admin-approved user-chosen replacement (password_hash_secondary).
    Either one logs them in — the original is never invalidated by a
    password change, only supplemented.
    """
    if check_password_hash(user["password_hash"], password):
        return True
    secondary = user.get("password_hash_secondary")
    if secondary and check_password_hash(secondary, password):
        return True
    return False


def login(username, password):
    """
    Checks the control database's admin accounts first, then falls back to
    searching every registered workspace's directory for a matching
    mentor/mentee account — so one login page works for all three roles
    regardless of which database a mentor/mentee's account actually lives in.
    """
    from db import users_col, workspaces_col, get_workspace_db

    user = users_col.find_one({"username": username})
    source_db_name = None

    if not user:
        for ws in workspaces_col.find({}, {"db_name": 1}):
            directory_col = get_workspace_db(ws["db_name"])["directory"]
            candidate = directory_col.find_one({"username": username})
            if candidate:
                user = candidate
                source_db_name = ws["db_name"]
                break

    if not user or not _password_matches(user, password):
        return None

    token = secrets.token_hex(24)
    from db import sessions_col
    sessions_col.insert_one({
        "token": token,
        "username": user["username"],
        "role": user["role"],
        "workspace_db": source_db_name,  # None for admins, set for mentor/mentee
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
    })
    return {"token": token, "username": user["username"], "role": user["role"]}


def get_session(token):
    from db import sessions_col
    if not token:
        return None
    return sessions_col.find_one({"token": token}, {"_id": 0})


def logout(token):
    from db import sessions_col
    sessions_col.delete_one({"token": token})


def require_auth(role=None):
    """Route decorator. @require_auth() for any logged-in user,
    @require_auth(role="admin") to restrict to a single role,
    @require_auth(role=["admin", "viewer"]) to allow any of several roles."""
    allowed = None
    if role is not None:
        allowed = {role} if isinstance(role, str) else set(role)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = request.headers.get("Authorization", "").replace("Bearer ", "")
            session = get_session(token)
            if not session:
                return jsonify({"error": "Not authenticated"}), 401
            if allowed and session["role"] not in allowed:
                return jsonify({"error": "Forbidden"}), 403

            g.session = session  # Attach session to Flask's g object

            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Mentor/mentee directory accounts (per-workspace database — its own
# "directory" collection, separate from the control database's admin users)
# ---------------------------------------------------------------------------

def find_account_and_location(username):
    """
    Locates an account (admin, mentor, or mentee) and where it lives.
    Returns (user_doc, location) where location is None for a control-db
    admin account, or the workspace db_name for a mentor/mentee account.
    Returns (None, None) if no account with this username exists anywhere.
    """
    from db import users_col, workspaces_col, get_workspace_db

    user = users_col.find_one({"username": username})
    if user:
        return user, None

    for ws in workspaces_col.find({}, {"db_name": 1}):
        directory_col = get_workspace_db(ws["db_name"])["directory"]
        candidate = directory_col.find_one({"username": username})
        if candidate:
            return candidate, ws["db_name"]

    return None, None


def generate_temp_password():
    """8-char, easy-to-read random password for distribution to mentors/mentees."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"  # no ambiguous chars (0/O, 1/l/I)
    return "".join(secrets.choice(alphabet) for _ in range(8))


def upsert_directory_user(workspace_db_name, username, role, profile):
    """
    Creates a mentor/mentee account inside the given workspace's own
    database if one doesn't exist yet (with a fresh random password), or
    just refreshes their profile data if the account already exists —
    existing passwords are never touched or regenerated.

    Uniqueness is scoped to the workspace: the same username can exist
    independently in two different workspaces (e.g. "101" from two
    different semesters' datasets) without clashing.

    Returns {"username", "role", "created": bool, "password": str|None}
    """
    from db import get_workspace_db

    directory_col = get_workspace_db(workspace_db_name)["directory"]
    directory_col.create_index("username", unique=True)

    existing = directory_col.find_one({"username": username})

    if existing:
        directory_col.update_one(
            {"username": username},
            {"$set": {"role": role, "profile": profile}},
        )
        return {"username": username, "role": role, "created": False, "password": None}

    password = generate_temp_password()
    directory_col.insert_one({
        "username": username,
        "password_hash": generate_password_hash(password),
        "role": role,
        "profile": profile,
        "created_at": datetime.now(timezone.utc),
    })
    return {"username": username, "role": role, "created": True, "password": password}


def sync_workspace_directory(workspace_db_name, cohorts):
    """
    Synchronizes a workspace's directory collection with a new match result:
    - Upserts active mentors and mentees with updated profile data.
    - Removes mentors or mentees that are no longer part of the match.
    - Preserves existing password hashes so credentials remain valid.

    Returns a dictionary summarizing accounts created, updated, and removed.
    """
    from db import get_workspace_db

    directory_col = get_workspace_db(workspace_db_name)["directory"]
    directory_col.create_index("username", unique=True)

    active_usernames = set()
    created_count = 0
    updated_count = 0
    passwords = {}

    for c in cohorts:
        mentor_name = c.get("mentor")
        mentor_uid = str(c.get("uid") or mentor_name).strip()
        students = c.get("students", [])
        student_uids = [str(s.get("uid")).strip() for s in students if s.get("uid")]

        # 1. Upsert Mentor Account
        active_usernames.add(mentor_uid)
        mentor_profile = {
            "Name": mentor_name,
            "assigned_mentees": student_uids,
        }
        res = upsert_directory_user(workspace_db_name, mentor_uid, "mentor", mentor_profile)
        if res["created"]:
            created_count += 1
            passwords[mentor_uid] = res["password"]
        else:
            updated_count += 1

        # 2. Upsert Mentee Accounts
        for student in students:
            mentee_uid = str(student.get("uid")).strip()
            if not mentee_uid:
                continue

            active_usernames.add(mentee_uid)
            mentee_profile = {k: v for k, v in student.items() if k != "uid"}
            mentee_profile["assigned_mentor"] = mentor_name

            m_res = upsert_directory_user(workspace_db_name, mentee_uid, "mentee", mentee_profile)
            if m_res["created"]:
                created_count += 1
                passwords[mentee_uid] = m_res["password"]
            else:
                updated_count += 1

    # 3. Clean up removed accounts (e.g. deleted mentors)
    delete_result = directory_col.delete_many({"username": {"$nin": list(active_usernames)}})
    removed_count = delete_result.deleted_count

    return {
        "created_count": created_count,
        "updated_count": updated_count,
        "removed_count": removed_count,
        "passwords": passwords,
    }
