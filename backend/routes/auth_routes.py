from flask import Blueprint, request, jsonify
from auth import login, get_session, logout

auth_bp = Blueprint("auth_bp", __name__)


@auth_bp.route("/api/login", methods=["POST"])
def login_route():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    session = login(username, password)
    if not session:
        return jsonify({"error": "Invalid username or password"}), 401
    return jsonify(session)


@auth_bp.route("/api/me", methods=["GET"])
def me_route():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    session = get_session(token)
    if not session:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify(session)


@auth_bp.route("/api/logout", methods=["POST"])
def logout_route():
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    logout(token)
    return jsonify({"ok": True})