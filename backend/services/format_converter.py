"""
Multi-format input converter.

Owns one job: taking a raw mentee/student dataset -- whatever column names,
order, or extra columns the source file happens to have -- and mapping it
onto the canonical mentee schema:

    Student ID, Name, Section, CGPA

...in that exact order, matching datasets/mentee_dataset_format.csv.

This lets uploads from different sources (a college ERP export, a
hand-built spreadsheet, an SQL dump with differently-named columns, etc.)
all normalize down to the same shape before they ever reach the matching
engine, instead of requiring every uploader to pre-format their file.

No Flask-specific code lives here, so it can be unit-tested, reused from a
script, or called from routes/dataloader.py during upload.
"""

import re

import pandas as pd

import random

# --------------------------------------------------------------------------
# Canonical schema
# --------------------------------------------------------------------------

CANONICAL_STUDENT_COLUMNS = ["Student ID", "Name", "Section", "CGPA"]

STUDENT_COLUMN_ALIASES = {
    "Student ID": [
        "student id", "studentid", "student_id", "id", "roll no", "rollno",
        "roll number", "roll_number", "usn", "reg no", "regno",
        "registration number", "registration_number", "srn", "enrollment no",
        "enrollment number", "enrollment_number", "student no", "student number",
    ],
    "Name": [
        "name", "student name", "studentname", "student_name", "full name",
        "fullname", "full_name", "mentee name", "mentee_name", "menteename",
    ],
    "Section": [
        "section", "sec", "class", "class section", "branch section",
        "batch", "division", "div",
    ],
    "CGPA": [
        "cgpa", "gpa", "grade point average", "grade point", "cgpa/gpa",
        "sgpa", "cumulative gpa",
    ],
}


def _normalize_header(name):
    return re.sub(r"[^a-z0-9]+", " ", str(name).strip().lower()).strip()


def needs_normalization(df):
    """
    True if the DataFrame's columns don't already exactly match the
    canonical schema (i.e. it came from a source with different headers,
    order, or extra columns and would benefit from conversion).
    """
    return list(df.columns) != CANONICAL_STUDENT_COLUMNS


def fill_missing_sections(df, section_col="Section", choices="ABCDEFGHIJK"):
    """
    Fills any missing/blank Section values with a random letter from
    `choices` (default A-K), in place on a copy of `df`.

    Treats these as "missing": NaN, None, and empty/whitespace-only strings.
    Leaves any already-present section value untouched.
    """
    df = df.copy()

    def _fill(v):
        if pd.isna(v) or str(v).strip() == "":
            return random.choice(list(choices))
        return v

    df[section_col] = df[section_col].apply(_fill)
    return df

def convert_dataframe(df):
    """
    Maps an arbitrary DataFrame's columns onto the canonical mentee schema
    (Student ID, Name, Section, CGPA), regardless of the source's original
    header names, order, or extra columns.

    Raises ValueError if a required column (Name or CGPA) can't be located.
    Returns a new DataFrame with exactly the 4 canonical columns, in order.
    """
    normalized_lookup = {_normalize_header(c): c for c in df.columns}

    resolved = {}
    for canonical, aliases in STUDENT_COLUMN_ALIASES.items():
        match_col = None
        # exact/alias match first
        for alias in [canonical] + aliases:
            key = _normalize_header(alias)
            if key in normalized_lookup:
                match_col = normalized_lookup[key]
                break
        # fallback: loose substring match (e.g. "Student ID Number")
        if match_col is None:
            for norm_key, orig_col in normalized_lookup.items():
                if any(_normalize_header(a) in norm_key for a in [canonical] + aliases):
                    match_col = orig_col
                    break
        resolved[canonical] = match_col

    missing_required = [c for c in ("Name", "CGPA") if resolved.get(c) is None]
    if missing_required:
        raise ValueError(
            "Could not find required column(s) "
            f"{', '.join(missing_required)} in the dataset. "
            f"Found columns: {', '.join(str(c) for c in df.columns)}"
        )

    out = pd.DataFrame()
    for canonical in CANONICAL_STUDENT_COLUMNS:
        src = resolved.get(canonical)
        if src is None:
            # Student ID / Section are optional; keep the column present but
            # blank so the output still strictly matches the canonical shape.
            out[canonical] = ["" for _ in range(len(df))]
        else:
            out[canonical] = df[src]

    out["Student ID"] = out["Student ID"].apply(
        lambda v: "" if pd.isna(v) else str(v).strip()
    )
    out["Name"] = out["Name"].astype(str).str.strip()
    out["Section"] = out["Section"].apply(
        lambda v: "" if pd.isna(v) else str(v).strip().upper()
    )
    out["CGPA"] = pd.to_numeric(out["CGPA"], errors="coerce")

    out = out.dropna(subset=["Name", "CGPA"])
    out = out[out["Name"].str.len() > 0]
    out = fill_missing_sections(out)   


    return out.reset_index(drop=True)


def normalize_student_dataframe(df):
    """
    Convenience wrapper used by the upload pipeline: converts `df` to the
    canonical schema only if it isn't already in that shape, and reports
    whether a conversion actually happened.

    Returns (normalized_df, was_normalized).
    """
    if not needs_normalization(df):
        return df, False

    converted = convert_dataframe(df)
    return converted, True
