
"""
dataloader.py

Universal dataset loader for the Mentor Distribution Engine.

Supports:
    - CSV
    - TXT
    - XLS
    - XLSX (single sheet or multiple sheets)
    - SQL (single table or multiple tables)

Returns:

{
    "mentors": [...],
    "mentees": [...]
}

This file is completely independent from Flask.
"""

import io
import re
import sqlite3

import pandas as pd

from services.format_converter import (
    STUDENT_COLUMN_ALIASES,
    normalize_student_dataframe,
)


# ---------------------------------------------------------------------
# Supported file types
# ---------------------------------------------------------------------

ALLOWED_EXTENSIONS = {
    "csv",
    "txt",
    "xlsx",
    "xls",
    "sql"
}


# ---------------------------------------------------------------------
# Detection keywords
# ---------------------------------------------------------------------

MENTOR_NAMES = {
    "mentor",
    "mentors",
    "mentor_list",
    "faculty",
    "faculty_list",
    "guide",
    "guides",
    "teacher",
    "teachers"
}

MENTEE_NAMES = {
    "mentee",
    "mentees",
    "student",
    "students",
    "student_list",
    "student_master",
    "learners",
    "learner"
}


# ---------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------

def get_extension(filename):
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


def normalize(name):
    return str(name).strip().lower().replace(" ", "_")


def clean_dataframe(df):
    df = df.copy()

    df.columns = [str(c).strip() for c in df.columns]

    df = df.dropna(how="all")

    df = df.fillna("")

    return df


# ---------------------------------------------------------------------
# CSV/TXT
# ---------------------------------------------------------------------

def read_csv_auto(raw):

    text = raw.decode("utf-8", errors="ignore")

    sample = text[:5000]

    delimiters = [",", "\t", ";", "|"]

    delimiter = max(delimiters, key=lambda d: sample.count(d))

    return clean_dataframe(
        pd.read_csv(io.StringIO(text), sep=delimiter)
    )


# ---------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------

def load_sql_tables(sql_text):

    conn = sqlite3.connect(":memory:")

    try:

        conn.executescript(sql_text)

        cursor = conn.cursor()

        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )

        tables = [x[0] for x in cursor.fetchall()]

        dfs = {}

        for table in tables:

            try:

                df = pd.read_sql_query(
                    f'SELECT * FROM "{table}"',
                    conn
                )

                if not df.empty:
                    dfs[table] = clean_dataframe(df)

            except Exception:
                pass

        return dfs

    finally:

        conn.close()


# ---------------------------------------------------------------------
# Excel
# ---------------------------------------------------------------------

def load_excel_sheets(raw):

    excel = pd.ExcelFile(io.BytesIO(raw))

    sheets = {}

    for sheet in excel.sheet_names:

        df = excel.parse(sheet)

        if not df.empty:

            sheets[sheet] = clean_dataframe(df)

    return sheets


# ---------------------------------------------------------------------
# Dataset identification
# ---------------------------------------------------------------------

def looks_like_mentor(df):

    cols = {normalize(c) for c in df.columns}

    mentor_columns = {
        "mentor",
        "mentor_name",
        "faculty",
        "guide",
        "teacher",
        "name"
    }

    return len(cols & mentor_columns) > 0


def _has_alias_match(cols_normalized, canonical):
    """True if any alias for `canonical` (Name/CGPA/etc.) appears among the
    dataframe's normalized column names. Lets mentee detection recognize
    differently-named source columns (e.g. 'usn', 'sgpa', 'batch') instead
    of requiring the literal 'cgpa'/'section' headers."""
    aliases = {normalize(a) for a in ([canonical] + STUDENT_COLUMN_ALIASES.get(canonical, []))}
    return len(cols_normalized & aliases) > 0


def looks_like_mentee(df):

    cols = {normalize(c) for c in df.columns}

    # Literal match (fast path, keeps existing behavior for already-canonical
    # or near-canonical files).
    required = {
        "cgpa",
        "section"
    }

    if required.issubset(cols):
        return True

    # Alias-aware fallback: recognizes arbitrary source column names (roll
    # no, usn, sgpa, batch, div, ...) as long as Name and CGPA can be
    # located, which is what the multi-format converter needs to normalize
    # this dataset onto the canonical schema.
    return _has_alias_match(cols, "Name") and _has_alias_match(cols, "CGPA")


def identify_datasets(objects):
    """
    objects = {
        sheet/table_name : dataframe
    }
    """

    mentors = None
    mentees = None

    # ---------------------------------------------------------
    # Pass 1
    # Detect by sheet/table names
    # ---------------------------------------------------------

    for name, df in objects.items():

        key = normalize(name)

        if key in MENTOR_NAMES and mentors is None:
            mentors = df

        elif key in MENTEE_NAMES and mentees is None:
            mentees = df

    # ---------------------------------------------------------
    # Pass 2
    # Detect by columns
    # ---------------------------------------------------------

    if mentors is None:

        for df in objects.values():

            if looks_like_mentor(df):
                mentors = df
                break

    if mentees is None:

        for df in objects.values():

            if looks_like_mentee(df):
                mentees = df
                break

    # ---------------------------------------------------------
    # Pass 3
    # Backward compatibility
    # ---------------------------------------------------------

    if len(objects) == 1:

        df = next(iter(objects.values()))

        if looks_like_mentee(df):

            mentees = df

        else:

            mentors = df

    return mentors, mentees


# ---------------------------------------------------------------------
# Main Loader
# ---------------------------------------------------------------------

def load_dataset(file_storage):
    """
    Main API

    Input:
        Flask uploaded file

    Output:

    {
        "mentors": [...],
        "mentees": [...]
    }
    """

    filename = file_storage.filename or ""

    ext = get_extension(filename)

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {ext}"
        )

    raw = file_storage.read()

    # ----------------------------------------------------------
    # CSV
    # ----------------------------------------------------------

    if ext == "csv":

        df = read_csv_auto(raw)

        mentors, mentees = identify_datasets({
            filename: df
        })

    # ----------------------------------------------------------
    # TXT
    # ----------------------------------------------------------

    elif ext == "txt":

        df = read_csv_auto(raw)

        mentors, mentees = identify_datasets({
            filename: df
        })

    # ----------------------------------------------------------
    # Excel
    # ----------------------------------------------------------

    elif ext in ("xls", "xlsx"):

        sheets = load_excel_sheets(raw)

        mentors, mentees = identify_datasets(sheets)

    # ----------------------------------------------------------
    # SQL
    # ----------------------------------------------------------

    elif ext == "sql":

        sql = raw.decode(
            "utf-8",
            errors="ignore"
        )

        tables = load_sql_tables(sql)

        mentors, mentees = identify_datasets(tables)

    else:
        raise ValueError("Unsupported file.")

    # ----------------------------------------------------------
    # Validation
    # ----------------------------------------------------------

    if mentors is None and mentees is None:

        raise ValueError(
            "Could not identify mentors or mentees in the uploaded file."
        )

    # ----------------------------------------------------------
    # Multi-format normalization
    #
    # Whatever column names/order the source mentee sheet used (roll no vs
    # USN, GPA vs CGPA, batch vs section, ...), map it onto the canonical
    # Student ID / Name / Section / CGPA schema here, once, so every
    # downstream consumer (matching engine, editable table, exports) only
    # ever has to deal with one shape.
    # ----------------------------------------------------------

    mentees_normalized = False
    if mentees is not None:
        try:
            mentees, mentees_normalized = normalize_student_dataframe(mentees)
        except ValueError:
            # Couldn't confidently map columns (e.g. Name/CGPA genuinely
            # missing) -- fall back to the raw parsed dataframe rather than
            # failing the whole upload.
            pass

    return {

        "mentors":
            [] if mentors is None
            else mentors.where(pd.notnull(mentors), None)
                        .to_dict("records"),

        "mentees":
            [] if mentees is None
            else mentees.where(pd.notnull(mentees), None)
                        .to_dict("records"),

        "mentees_normalized": mentees_normalized,
    }

