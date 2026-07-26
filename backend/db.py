"""
MongoDB connection. Reads the connection string from the MONGO_URI env var
so credentials never get hardcoded/committed.

`control` database (MONGO_DB_NAME) holds admin logins, sessions, and the
registry of "workspaces" — one real Mongo database per dataset/match the
admin has saved. Each workspace's own mentor/mentee directory data lives
in that workspace's own database, fully separate from every other one.
"""
import os
import re
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27018")
DB_NAME = os.environ.get("MONGO_DB_NAME", "mentor_mentee")
print(f"[db.py] Connecting to {MONGO_URI}, database={DB_NAME}")

client = MongoClient(MONGO_URI)

# --- Control plane: fixed, always the same database ---
db = client[DB_NAME]

users_col = db["users"]
sessions_col = db["sessions"]
workspaces_col = db["workspaces"]

users_col.create_index("username", unique=True)
sessions_col.create_index("token", unique=True)
sessions_col.create_index("expires_at", expireAfterSeconds=0)
workspaces_col.create_index("db_name", unique=True)


def slugify_workspace_name(name):
    slug = re.sub(r"[^a-z0-9]+", "-", str(name).strip().lower()).strip("-")
    return slug or "workspace"


def get_workspace_db(db_name):
    """Returns a handle to a specific workspace's own database."""
    return client[db_name]