"""
routes/password_routes.py

Any account holder can request a password change from the login page —
but it doesn't take effect until an admin approves it. Approving sets
`password_hash_secondary` on the account (auth.py's login() accepts either
the original auto-generated password or this one — the original is never
invalidated).

Requests live alongside the account itself: in the control database for
admins, in the relevant workspace's own database for mentors/mentees —
same split the rest of the auth system already uses.
"""
import secrets
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

from auth import require_auth, find_account_and_location, _password_matches

password_bp = Blueprint("password_bp", __name__)


def _requests_col(location):
    """location is None for the control db, or a workspace db_name."""
    from db import db as control_db, get_workspace_db
    if location is None:
        return control_db["password_requests"]
    return get_workspace_db(location)["password_requests"]


def _account_col(location):
    from db import users_col, get_workspace_db
    if location is None:
        return users_col
    return get_workspace_db(location)["directory"]


@password_bp.route("/api/password-requests", methods=["POST"])
def request_password_change_route():
    """
    Body: { username, current_password, new_password }
    No login session required (this is reachable from the login page,
    before the person has a valid session) — identity is proven by
    supplying a currently-valid password instead.
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not username or not current_password or not new_password:
        return jsonify({"error": "username, current_password, and new_password are all required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    user, location = find_account_and_location(username)
    if not user or not _password_matches(user, current_password):
        return jsonify({"error": "Username or current password is incorrect"}), 401

    request_id = secrets.token_hex(12)
    _requests_col(location).insert_one({
        "request_id": request_id,
        "username": username,
        "role": user["role"],
        "new_password_hash": generate_password_hash(new_password),
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
    })

    return jsonify({"message": "Request submitted. An admin needs to approve it before the new password is active."})


@password_bp.route("/api/password-requests", methods=["GET"])
@require_auth(role="admin")
def list_password_requests_route():
    """
    ?workspace=<db_name> for mentor/mentee requests, or omit it entirely
    to see pending admin-account requests in the control database.
    """
    workspace_db_name = request.args.get("workspace") or None
    col = _requests_col(workspace_db_name)
    pending = list(col.find({"status": "pending"}, {"_id": 0}))
    pending.sort(key=lambda r: r["requested_at"])
    return jsonify({"requests": pending})


@password_bp.route("/api/password-requests/<request_id>/approve", methods=["POST"])
@require_auth(role="admin")
def approve_password_request_route(request_id):
    data = request.get_json(silent=True) or {}
    workspace_db_name = data.get("workspace") or None

    requests_col = _requests_col(workspace_db_name)
    req = requests_col.find_one({"request_id": request_id, "status": "pending"})
    if not req:
        return jsonify({"error": "Request not found or already handled"}), 404

    account_col = _account_col(workspace_db_name)
    result = account_col.update_one(
        {"username": req["username"]},
        {"$set": {"password_hash_secondary": req["new_password_hash"]}},
    )
    if result.matched_count == 0:
        return jsonify({"error": "Account no longer exists"}), 404

    requests_col.update_one({"request_id": request_id}, {"$set": {"status": "approved"}})
    return jsonify({"message": f"Approved. {req['username']} can now log in with either password."})


@password_bp.route("/api/password-requests/<request_id>/reject", methods=["POST"])
@require_auth(role="admin")
def reject_password_request_route(request_id):
    data = request.get_json(silent=True) or {}
    workspace_db_name = data.get("workspace") or None

    requests_col = _requests_col(workspace_db_name)
    result = requests_col.update_one(
        {"request_id": request_id, "status": "pending"},
        {"$set": {"status": "rejected"}},
    )
    if result.matched_count == 0:
        return jsonify({"error": "Request not found or already handled"}), 404

    return jsonify({"message": "Request rejected."})