import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import request, jsonify
from flask import request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash

from db import users_col, sessions_col

SESSION_TTL_HOURS = 12


def create_user(username, password, role="user"):
    """Used by the seed script / an admin panel to create accounts."""
    if users_col.find_one({"username": username}):
        raise ValueError(f"User '{username}' already exists")
    users_col.insert_one({
        "username": username,
        "password_hash": generate_password_hash(password),
        "role": role,
        "created_at": datetime.now(timezone.utc),
    })

def generate_temp_password():
    """8-char, easy-to-read random password for distribution to mentors/mentees."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"  # no ambiguous chars (0/O, 1/l/I)
    return "".join(secrets.choice(alphabet) for _ in range(8))


def upsert_directory_user(username, role, profile):
    """
    Creates a mentor/mentee account if one doesn't exist yet (with a fresh
    random password), or just refreshes their profile data (assigned
    mentor/mentees, section, CGPA, etc.) if the account already exists —
    existing passwords are never touched or regenerated.

    Returns {"username", "role", "created": bool, "password": str|None}
    — password is only non-None when the account was newly created, since
    we never store or re-derive plaintext passwords for existing accounts.
    """
    from db import users_col  # local import to avoid a circular import with db.py

    existing = users_col.find_one({"username": username})

    if existing:
        users_col.update_one(
            {"username": username},
            {"$set": {"role": role, "profile": profile}},
        )
        return {"username": username, "role": role, "created": False, "password": None}

    password = generate_temp_password()
    users_col.insert_one({
        "username": username,
        "password_hash": generate_password_hash(password),
        "role": role,
        "profile": profile,
        "created_at": datetime.now(timezone.utc),
    })
    return {"username": username, "role": role, "created": True, "password": password}

def generate_temp_password():
    """8-char, easy-to-read random password for distribution to mentors/mentees."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"  # no ambiguous chars (0/O, 1/l/I)
    return "".join(secrets.choice(alphabet) for _ in range(8))


def upsert_directory_user(username, role, profile):
    """
    Creates a mentor/mentee account if one doesn't exist yet (with a fresh
    random password), or just refreshes their profile data (assigned
    mentor/mentees, section, CGPA, etc.) if the account already exists —
    existing passwords are never touched or regenerated.

    Returns {"username", "role", "created": bool, "password": str|None}
    — password is only non-None when the account was newly created, since
    we never store or re-derive plaintext passwords for existing accounts.
    """
    from db import users_col  # local import to avoid a circular import with db.py

    existing = users_col.find_one({"username": username})

    if existing:
        users_col.update_one(
            {"username": username},
            {"$set": {"role": role, "profile": profile}},
        )
        return {"username": username, "role": role, "created": False, "password": None}

    password = generate_temp_password()
    users_col.insert_one({
        "username": username,
        "password_hash": generate_password_hash(password),
        "role": role,
        "profile": profile,
        "created_at": datetime.now(timezone.utc),
    })
    return {"username": username, "role": role, "created": True, "password": password}

def login(username, password):
    user = users_col.find_one({"username": username})
    if not user or not check_password_hash(user["password_hash"], password):
        return None

    token = secrets.token_hex(24)
    sessions_col.insert_one({
        "token": token,
        "username": user["username"],
        "role": user["role"],
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
    })
    return {"token": token, "username": user["username"], "role": user["role"]}


def get_session(token):
    if not token:
        return None
    return sessions_col.find_one({"token": token}, {"_id": 0})


def logout(token):
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
            g.session = session
            return fn(*args, **kwargs)
        return wrapper
    return decorator
