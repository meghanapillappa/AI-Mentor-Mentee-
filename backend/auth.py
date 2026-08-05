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
    @require_auth(role="admin") to restrict to admins."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = request.headers.get("Authorization", "").replace("Bearer ", "")
            session = get_session(token)
            if not session:
                return jsonify({"error": "Not authenticated"}), 401
            if role and session["role"] != role:
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
