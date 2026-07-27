"""
MongoDB connection. Reads the connection string from the MONGO_URI env var
so credentials never get hardcoded/committed.
"""
import os
from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.environ.get("MONGO_DB_NAME", "mentor_mentee")
print(f"[db.py] Connecting to {MONGO_URI}, database={DB_NAME}")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

users_col = db["users"]
sessions_col = db["sessions"]
cohorts_col = db["cohorts"]

# One-time index setup — safe to call on every startup, no-ops if it exists.
users_col.create_index("username", unique=True)
sessions_col.create_index("token", unique=True)
sessions_col.create_index("expires_at", expireAfterSeconds=0)  # Mongo TTL auto-cleanup
