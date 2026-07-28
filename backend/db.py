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
from pymongo.errors import ServerSelectionTimeoutError

# ----------------------------------------------------------
# Load environment variables
# ----------------------------------------------------------
load_dotenv()

# MongoDB configuration
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.environ.get("MONGO_DB_NAME", "mentor_mentee")

# ----------------------------------------------------------
# Debug Information
# ----------------------------------------------------------
print("=" * 60)
print("Running file :", os.path.abspath(__file__))
print("Working dir  :", os.getcwd())
print("MONGO_URI    :", MONGO_URI)
print("DB_NAME      :", DB_NAME)
print("=" * 60)

# ----------------------------------------------------------
# Connect to MongoDB
# ----------------------------------------------------------
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)

    # Force a connection attempt
    client.admin.command("ping")

    print("[db.py] ✅ Successfully connected to MongoDB")

except ServerSelectionTimeoutError as e:
    print("[db.py] ❌ Failed to connect to MongoDB")
    print(e)
    raise

# ----------------------------------------------------------
# Control database
# ----------------------------------------------------------
db = client[DB_NAME]

# Collections
users_col = db["users"]
sessions_col = db["sessions"]
workspaces_col = db["workspaces"]

# ----------------------------------------------------------
# Create indexes (safe to call multiple times)
# ----------------------------------------------------------
users_col.create_index("username", unique=True)
sessions_col.create_index("token", unique=True)
sessions_col.create_index("expires_at", expireAfterSeconds=0)
workspaces_col.create_index("db_name", unique=True)

print("[db.py] Database indexes verified.")

# ----------------------------------------------------------
# Utility Functions
# ----------------------------------------------------------
def slugify_workspace_name(name):
    """
    Converts a workspace name into a database-safe slug.

    Example:
        "AI Project 1" -> "ai-project-1"
    """
    slug = re.sub(r"[^a-z0-9]+", "-", str(name).strip().lower()).strip("-")
    return slug or "workspace"


def get_workspace_db(db_name):
    """
    Returns a handle to a workspace-specific MongoDB database.
    """
    return client[db_name]