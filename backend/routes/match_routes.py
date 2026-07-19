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

        if not students_data or not mentors_list:
            return jsonify({
                "matches": [],
                "message": "Students or mentors dataset is empty."
            }), 200

        students_df = pd.DataFrame(students_data)
        students_df["CGPA"] = pd.to_numeric(students_df["CGPA"], errors="coerce")
        students_df = students_df.dropna(subset=["CGPA"])

        matched_results = balance_matching(students_df, mentors_list)

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

        if not cohorts:
            return jsonify({"error": "No existing match to rebalance"}), 400
        if not removed_mentor:
            return jsonify({"error": "removed_mentor is required"}), 400

        updated = remove_mentor_rebalance(cohorts, removed_mentor)
        return jsonify(updated)

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
