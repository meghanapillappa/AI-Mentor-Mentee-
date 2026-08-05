"""
One-time setup: creates a read-only "viewer" account — can see everything
in the db-viewer/deadlines/workspaces endpoints (full student & mentor
details) but cannot log in to any endpoint that creates, edits, deletes,
or runs matching (those are all admin-only or mentor/mentee-only).
Run from backend/: python scripts/create_viewer.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import create_user

if __name__ == "__main__":
    username = input("Viewer username: ").strip()
    password = input("Viewer password: ").strip()
    create_user(username, password, role="viewer")
    print(f"Viewer user '{username}' created.")
