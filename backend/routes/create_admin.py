"""
One-time setup: creates the admin account.
Run from backend/: python scripts/create_admin.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import create_user

if __name__ == "__main__":
    username = input("Admin username: ").strip()
    password = input("Admin password: ").strip()
    create_user(username, password, role="admin")
    print(f"Admin user '{username}' created.")