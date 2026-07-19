"""
File parsing service.

Owns everything related to turning an uploaded file (csv / txt / xlsx / xls /
sql) into a DataFrame, and turning a DataFrame back into a downloadable file.
This module has no Flask-specific code in it (no `request`/`jsonify`), so it
can be unit-tested or reused on its own.

If you're adding support for a new file format, this is the only file you
should need to touch.
"""

import io
import re
import sqlite3

import numpy as np
import pandas as pd


ALLOWED_EXTENSIONS = {'csv', 'txt', 'xlsx', 'xls', 'sql'}


def get_extension(filename):
    if not filename or '.' not in filename:
        return ''
    return filename.rsplit('.', 1)[-1].lower()


def sanitize_ident(name):
    return re.sub(r'[^A-Za-z0-9_]', '_', str(name)) or 'col'


def dataframe_to_sql(df, table_name):
    """Generate a CREATE TABLE + INSERT INTO SQL script from a DataFrame."""
    table_name = sanitize_ident(table_name)
    columns = [sanitize_ident(c) for c in df.columns]

    lines = [f"CREATE TABLE {table_name} (", ",\n".join(f"  {c} TEXT" for c in columns), ");", ""]

    for _, row in df.iterrows():
        values = []
        for col in df.columns:
            val = row[col]
            if pd.isna(val):
                values.append("NULL")
            elif isinstance(val, (int, float, np.integer, np.floating)):
                values.append(str(val))
            else:
                escaped = str(val).replace("'", "''")
                values.append(f"'{escaped}'")
        lines.append(
            f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(values)});"
        )

    return "\n".join(lines)


def dataframe_to_file_bytes(df, fmt, table_name):
    """
    Serializes a DataFrame to bytes in the requested format.
    Returns (bytes_buffer, mimetype, file_extension). Raises ValueError for
    an unsupported format.
    """
    buffer = io.BytesIO()
    fmt = (fmt or 'csv').lower()

    if fmt == 'csv':
        df.to_csv(buffer, index=False)
        mimetype = 'text/csv'
    elif fmt == 'txt':
        df.to_csv(buffer, index=False, sep='\t')
        mimetype = 'text/plain'
    elif fmt in ('xlsx', 'xls'):
        df.to_excel(buffer, index=False, engine='openpyxl')
        mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        fmt = 'xlsx'
    elif fmt == 'sql':
        sql_text = dataframe_to_sql(df, table_name)
        buffer.write(sql_text.encode('utf-8'))
        mimetype = 'application/sql'
    else:
        raise ValueError(f"Unsupported format: {fmt}")

    buffer.seek(0)
    return buffer, mimetype, fmt
