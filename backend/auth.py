import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import request, jsonify
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
            return fn(*args, **kwargs)
        return wrapper
    return decorator