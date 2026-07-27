"""
Matching routes: run the full mentor/mentee balancing algorithm, and
incrementally rebalance when a mentor is added or removed afterwards.

Endpoints:
    POST /api/match
    POST /api/rebalance-add
    POST /api/rebalance-remove

If your feature is about *matching/rebalancing behavior*, edit
services/matching_engine.py; this file should only need to change if the
request/response shape itself changes.
"""

import pandas as pd
from flask import Blueprint, jsonify, request
from auth import require_auth

from datetime import datetime, timezone
from flask import g
from db import cohorts_col

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


@match_bp.route('/api/publish-cohorts', methods=['POST'])
@require_auth(role="admin")
def publish_cohorts_route():
    """
    Body: { cohorts: [<match result>] }
    Saves the admin's current match results as the "live" published set,
    which mentors can then fetch via /api/my-cohort. Overwrites whatever
    was published before (single active snapshot, not a history).
    """
    data = request.get_json(silent=True)
    if not data or not data.get("cohorts"):
        return jsonify({"error": "No cohorts provided"}), 400

    cohorts_col.update_one(
        {"_id": "current"},
        {"$set": {
            "cohorts": data["cohorts"],
            "published_at": datetime.now(timezone.utc),
            "published_by": g.session["username"],
        }},
        upsert=True,
    )
    return jsonify({"message": "Cohorts published", "count": len(data["cohorts"])})


@match_bp.route('/api/my-cohort', methods=['GET'])
@require_auth(role="mentor")
def my_cohort_route():
    """
    Returns the cohort belonging to the currently logged-in mentor, from the
    most recently published set. Matches on cohort["mentor"] == username,
    so a mentor's login username must match the "Mentor" name used in the
    dataset — adjust the match key here if that's not the case in your data.
    """
    doc = cohorts_col.find_one({"_id": "current"})
    if not doc:
        return jsonify({"error": "No cohorts have been published yet"}), 404

    username = g.session["username"]
    cohort = next((c for c in doc["cohorts"] if c.get("mentor") == username), None)
    if not cohort:
        return jsonify({"error": "No cohort found for you in the published results"}), 404

    return jsonify({"cohort": cohort})
