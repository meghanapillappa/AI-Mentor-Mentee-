"""
File I/O routes: uploading/parsing a dataset file, and saving an edited
dataset back out as a downloadable file.

Endpoints:
    POST /api/parse-file
    POST /api/save-file

If your feature is about *file formats* or *editing/exporting the raw
mentor/mentee tables*, this is the file to touch. It delegates all the
actual parsing/serialization work to services/file_parsing.py.
"""

import re

import pandas as pd
from flask import Blueprint, jsonify, request, send_file
from .dataloader import load_dataset
from services.file_parsing import dataframe_to_file_bytes
from auth import require_auth

file_bp = Blueprint('files', __name__)


@file_bp.route('/api/parse-file', methods=['POST'])
@require_auth(role="admin")
def parse_file_route():
    """
    Universal file parser.

    Accepts:
        csv
        txt
        xlsx
        xls
        sql

    Returns

    {
        "mentors":[...],
        "mentees":[...]
    }
    """

    try:

        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file_storage = request.files["file"]

        if file_storage.filename == "":
            return jsonify({"error": "No selected file"}), 400

        data = load_dataset(file_storage)

        return jsonify(data)

    except Exception as e:

        return jsonify({
            "error": str(e)
        }), 500


@file_bp.route('/api/save-file', methods=['POST'])
@require_auth(role="admin")
def save_file_route():
    """
    Accepts JSON { rows: [...], format: 'csv'|'txt'|'xlsx'|'sql', filename, table_name? }
    and returns the (possibly user-edited) dataset as a downloadable file.
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        rows = data.get("rows", [])
        fmt = (data.get("format") or "csv").lower()
        filename_base = re.sub(r'[^A-Za-z0-9_\-]', '_', data.get("filename", "data")) or "data"
        table_name = data.get("table_name", filename_base)

        if not rows:
            return jsonify({"error": "No rows to save"}), 400

        df = pd.DataFrame(rows)

        try:
            buffer, mimetype, out_ext = dataframe_to_file_bytes(df, fmt, table_name)
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400

        return send_file(
            buffer,
            mimetype=mimetype,
            as_attachment=True,
            download_name=f"{filename_base}.{out_ext}"
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500
