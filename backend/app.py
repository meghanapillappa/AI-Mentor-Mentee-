"""
App entrypoint. This file should stay thin: create the app, enable CORS,
register each feature's blueprint, and run.

Adding a whole new feature area (e.g. a notifications API)? Create
routes/notifications_routes.py with its own Blueprint and register it below
— you shouldn't need to touch any other route file to do it.
"""

from flask import Flask
from flask_cors import CORS

from routes.file_routes import file_bp
from routes.match_routes import match_bp
from routes.auth_routes import auth_bp
import db  # noqa: F401 — triggers index creation on startup
from routes.workspace_routes import workspace_bp
from routes.save_directory_routes import save_directory_bp
from routes.mentee_sessions_routes import mentee_sessions_bp
from routes.deadline_routes import deadline_bp
from routes.mentee_profile_routes import mentee_profile_bp


from dotenv import load_dotenv

load_dotenv()


app = Flask(__name__)
# Enable CORS to allow your separate Frontend UI to communicate with this Backend
CORS(app, expose_headers=["Authorization"], allow_headers=["Content-Type", "Authorization"])

app.register_blueprint(auth_bp)
app.register_blueprint(file_bp)
app.register_blueprint(match_bp)
app.register_blueprint(save_directory_bp)
app.register_blueprint(mentee_sessions_bp)
app.register_blueprint(deadline_bp)
app.register_blueprint(workspace_bp)
app.register_blueprint(mentee_profile_bp)



if __name__ == '__main__':
    for rule in app.url_map.iter_rules():
        print(rule)
    app.run(port=5001, debug=True)
