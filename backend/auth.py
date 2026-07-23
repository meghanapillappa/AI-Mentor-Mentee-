import secrets
from functools import wraps
from flask import request, jsonify

# NOTE: in-memory auth for a small internal tool — not production-grade.
# Sessions reset whenever the Flask process restarts.
USERS = {
    "admin": {"password": "changeme123", "role": "admin"},
}

SESSIONS = {}  # token -> {"username": ..., "role": ...}


def login(username, password):
    user = USERS.get(username)
    if not user or user["password"] != password:
        return None
    token = secrets.token_hex(24)
    SESSIONS[token] = {"username": username, "role": user["role"]}
    return {"token": token, "username": username, "role": user["role"]}


def get_session(token):
    return SESSIONS.get(token)


def logout(token):
    SESSIONS.pop(token, None)


def require_auth(role=None):
    """Route decorator. Use @require_auth() for any logged-in user,
    or @require_auth(role="admin") to restrict to admins."""
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