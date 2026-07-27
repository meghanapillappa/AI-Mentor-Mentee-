"""
Matching routes: run the full mentor/mentee balancing algorithm, and
incrementally rebalance when a mentor is added or removed afterwards.

Endpoints:
    POST /api/match
    POST /api/rebalance-add
    POST /api/rebalance-remove
    GET  /api/my-cohort

If your feature is about *matching/rebalancing behavior*, edit
services/matching_engine.py; this file should only need to change if the
request/response shape itself changes.
"""

import pandas as pd
from flask import Blueprint, jsonify, request, g
from auth import require_auth

from services.matching_engine import (
    balance_matching,
    add_mentor_rebalance,
    remove_mentor_rebalance,
)

match_bp = Blueprint('matching', __name__)


@match_bp.route('/api/match', methods=['POST'])
def match_mentors_students():
    try:
        data = request.get_json(silent=True)

        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        students_data = data.get("students", [])
        mentors_list = data.get("mentors", [])
        excluded_mentors = data.get("excluded_mentors", [])

        if not students_data or not mentors_list:
            return jsonify({
                "matches": [],
                "message": "Students or mentors dataset is empty."
            }), 200

        students_df = pd.DataFrame(students_data)
        students_df["CGPA"] = pd.to_numeric(students_df["CGPA"], errors="coerce")
        students_df = students_df.dropna(subset=["CGPA"])

        matched_results = balance_matching(students_df, mentors_list, excluded_mentors)
        return jsonify(matched_results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@match_bp.route('/api/rebalance-add', methods=['POST'])
def rebalance_add_route():
    """
    Body: { cohorts: [<current match result>], new_mentor: "Name" }
    Adds a new mentor, pulling a stratum-balanced slice of students from each
    existing mentor while leaving the rest of the mapping intact.

    Response shape: {
      cohorts: [<updated match result>],
      new_mentor: "Name",
      students_pulled: <int>,
      sources: [
        { mentor: "Name", students_given: <int>, students: [...] }, ...
      ]
    }
    (Feeds the frontend audit log so every mentor addition stays traceable.)
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        cohorts = data.get("cohorts", [])
        new_mentor = (data.get("new_mentor") or "").strip()

        if not cohorts:
            return jsonify({"error": "No existing match to rebalance"}), 400
        if not new_mentor:
            return jsonify({"error": "new_mentor is required"}), 400

        updated = add_mentor_rebalance(cohorts, new_mentor)
        return jsonify(updated)

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@match_bp.route('/api/rebalance-remove', methods=['POST'])
def rebalance_remove_route():
    """
    Body: { cohorts: [<current match result>], removed_mentor: "Name" }
    Removes a mentor and redistributes only their students among the
    remaining mentors, leaving everyone else's mapping untouched.

    Response shape: {
      cohorts: [<updated match result>],
      removed_mentor: "Name",
      students_reassigned: <int>,
      redistribution: [
        { mentor: "Name", students_received: <int>, students: [...] }, ...
      ]
    }
    (Feeds the frontend audit log so every mentor removal stays traceable.)
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        cohorts = data.get("cohorts", [])
        removed_mentor = (data.get("removed_mentor") or "").strip()
        excluded_mentors = data.get("excluded_mentors", [])

        if not cohorts:
            return jsonify({"error": "No existing match to rebalance"}), 400
        if not removed_mentor:
            return jsonify({"error": "removed_mentor is required"}), 400

        updated = remove_mentor_rebalance(cohorts, removed_mentor, excluded_mentors)
        return jsonify(updated)

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    

@match_bp.route('/api/my-cohort', methods=['GET'])
@require_auth(role="mentor")
def my_cohort_route():
    """
    Returns the requesting mentor's own cohort, built from their user
    profile (saved by /api/save-match-to-db), resolving each assigned
    mentee username back to their own saved profile data.

    Mentor/mentee accounts live in their own workspace's "directory"
    collection (not the control database's users_col) — the session
    remembers which workspace this account came from, set at login time.
    """
    from db import get_workspace_db

    username = g.session["username"]
    workspace_db_name = g.session.get("workspace_db")

    if not workspace_db_name:
        return jsonify({"error": "This account isn't linked to a saved workspace."}), 404

    directory_col = get_workspace_db(workspace_db_name)["directory"]

    mentor_doc = directory_col.find_one({"username": username, "role": "mentor"})
    if not mentor_doc:
        return jsonify({"error": "No cohort found for you yet. An admin needs to save a match first."}), 404

    profile = mentor_doc.get("profile", {})
    mentee_usernames = profile.get("assigned_mentees", [])

    students = []
    for mentee_username in mentee_usernames:
        mentee_doc = directory_col.find_one({"username": mentee_username, "role": "mentee"})
        if mentee_doc:
            mentee_profile = mentee_doc.get("profile", {})
            student = {k: v for k, v in mentee_profile.items() if k != "assigned_mentor"}
            student["uid"] = mentee_username
            students.append(student)

    cgpas = [s.get("CGPA") for s in students if isinstance(s.get("CGPA"), (int, float))]
    average_gpa = sum(cgpas) / len(cgpas) if cgpas else 0

    cohort = {
        "mentor": profile.get("Name", username),
        "student_count": len(students),
        "average_gpa": average_gpa,
        "students": students,
    }
    return jsonify({"cohort": cohort})

