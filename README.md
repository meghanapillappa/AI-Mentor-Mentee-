# Mentor Distribution Engine (AI-Mentor-Mentee)

A proportional-fair mentor/mentee matching **and multi-tenant workspace
persistence** platform: upload a mentor roster and a student database, run a
stratified-balancing algorithm (by grade boundary, section, and CGPA), then
add, remove or exclude mentors afterwards and watch the engine rebalance
incrementally instead of reshuffling everyone.

Beyond matching, the app persists each run to its own MongoDB workspace,
provisions logins for every mentor and mentee, and exposes **role-based
portals** for Admins, Mentors, Mentees and read-only Viewers.

The project has one Flask backend and **two** interchangeable frontends: a
React (Vite) app (`front2/`, the actively developed one) and the original
vanilla-JS app (`index.html` + `js/`, kept for reference). Both talk to the
same backend over the same HTTP contract — pick whichever you want to run;
you don't need both. Note that the newer features (auth, workspaces,
portals, database viewer) live in `front2/` only.

---

## 📁 Directory structure

```text
AI-Mentor-Mentee/
├── README.md                    # ← you are here
│
├── backend/                     # Flask API
│   ├── app.py                   # Entrypoint: creates the app, enables CORS, registers blueprints
│   ├── auth.py                  # Token handling, password hashing, workspace directory sync
│   ├── db.py                    # MongoDB handles (control DB + dynamic workspace DBs)
│   ├── routes/
│   │   ├── auth_routes.py             # Login, logout, session state
│   │   ├── create_admin.py            # Admin seeding utility
│   │   ├── create_viewer.py           # Viewer seeding utility
│   │   ├── dataloader.py              # Universal upload parser + mentor/mentee auto-detection
│   │   ├── Db_viewer_routes.py        # Read-only database viewer endpoints
│   │   ├── deadline_routes.py         # Submission deadline management
│   │   ├── file_routes.py             # POST /api/parse-file, POST /api/save-file
│   │   ├── match_routes.py            # /api/match, /api/rebalance-add, /api/rebalance-remove
│   │   ├── mentee_profile_routes.py   # Mentee profile fetch
│   │   ├── mentee_sessions_routes.py  # Meeting/session logging
│   │   ├── password_routes.py         # Reset requests & admin approvals
│   │   ├── save_directory_routes.py   # Snapshot serialization to a workspace DB
│   │   └── workspace_routes.py        # Workspace CRUD (list / save / drop)
│   └── services/
│       ├── file_parsing.py      # CSV/TXT/XLSX/SQL read + write (data access layer)
│       ├── format_converter.py  # Multi-format input converter (column-alias normalization)
│       └── matching_engine.py   # Stratified balancing + incremental add/remove rebalancing
│
├── front2/                      # ✅ React (Vite) frontend — actively developed
│   ├── index.html               # Vite entry HTML (mounts <div id="root">)
│   ├── package.json / package-lock.json
│   ├── vite.config.js           # Dev server on :5173
│   ├── .env.example             # Copy to .env to point at a non-local backend
│   ├── README.md                # Frontend-specific run/build/deploy instructions
│   └── src/
│       ├── main.jsx             # ReactDOM root
│       ├── App.jsx              # Top-level layout + routing; wires hooks & components
│       ├── config.js            # Resolves API_BASE (query param → localStorage → .env → default)
│       ├── index.css            # Full stylesheet (design tokens, layout, components)
│       ├── hooks/
│       │   ├── useAuth.js           # Auth/session context hook
│       │   └── useMentorEngine.js   # All shared matching state + business logic (the "brain")
│       ├── lib/
│       │   ├── api.js               # Every fetch() call to the Flask backend
│       │   ├── auth.js              # LocalStorage token helper
│       │   ├── utils.js             # getField/extractMentorsList/extractStudentsList/etc.
│       │   ├── filterCohorts.js     # Pure search/filter/view-limit logic for results
│       │   └── auditLog.js          # Normalizes add/remove payloads into one event shape
│       └── components/
│           ├── Sidebar.jsx              # File uploads + "Execute Balancing" + navigation
│           ├── DatasetEditor.jsx        # Editable mentors/mentees preview tables
│           ├── RemovalDecisionModal.jsx # Choose redistribute vs. direct-map on mentor removal
│           ├── ReallocationBanner.jsx   # "Mentor removed, here's who moved" banner
│           ├── AuditLog.jsx             # Persistent, downloadable add/remove history
│           ├── MacroMetrics.jsx         # Summary metric tiles
│           ├── SearchFilterBar.jsx      # Search + filter + view-limit controls
│           ├── CohortsGrid.jsx          # Results grid (loading/error/empty states)
│           ├── CohortCard.jsx           # One mentor's roster card
│           ├── WorkspaceSelector.jsx    # Pick / save / drop a MongoDB workspace
│           ├── NewCredentialsModal.jsx  # Shows generated temp passwords after a sync
│           ├── DatabaseViewerPage.jsx   # 🔍 Read-only database inspector
│           ├── ViewerHome.jsx           # Viewer-role landing page
│           ├── LoginPage.jsx            # Auth entry
│           ├── ChangePasswordPage.jsx   # Self-service password update
│           ├── ForgotPasswordPage.jsx   # Raise a reset request
│           ├── PasswordRequestsPage.jsx # Admin approval queue
│           ├── DeadlineBanner.jsx       # Countdown to mentor log submission
│           ├── DeadlinesPage.jsx        # Admin deadline management
│           ├── MentorHome.jsx           # Mentor portal: roster + session logger
│           ├── MenteeHome.jsx           # Mentee portal: assigned mentor + logs
│           ├── MenteeDetailModal.jsx    # Student contact card
│           └── UserHome.jsx             # Role-based dashboard router
│
├── index.html                   # 🗄️ Legacy vanilla-JS frontend — kept for reference
└── js/                           # (matching features only, same backend contract, no build step)
    ├── state.js                  # Global state + cached DOM refs (must load first)
    ├── utils.js                  # Generic helpers
    ├── api.js                    # fetch() layer
    ├── datasetEditor.js          # Upload handling + editable tables
    ├── matching.js               # Run match, incremental add/remove
    ├── reallocationReport.js     # Mentor-removal impact banner
    └── filters.js                # Search/sort/pagination for results
```

> **Which frontend should I run?** Use `front2/`. The root `index.html`/`js/`
> vanilla version is a lighter-weight, no-build-step reference for the core
> matching flow only — auth, workspaces, portals and the database viewer are
> React-only.

---

## 🧠 How it works, end to end

1. **Sign in.** Admins, mentors, mentees and viewers all authenticate through
   `POST /api/login`; the token is stored client-side by `lib/auth.js` and
   `useAuth.js` resolves the role, which decides which portal renders.
2. **Upload.** (Admin) A mentor roster and a student database go up via
   `POST /api/parse-file` — as one combined workbook/SQL dump, or as two
   separate files. Accepts `.csv`, `.txt`, `.xlsx`, `.xls`, `.sql`.
3. **Auto-detect & normalize.** `dataloader.py` figures out which
   sheet/table is mentors vs. mentees (by name, then by column signature),
   then runs the mentee dataset through the **multi-format input converter**
   (`services/format_converter.py`), which maps whatever column names/order
   the source used (`USN`, `SGPA`, `Batch`, ...) onto the canonical schema:
   `Student ID, Name, Section, CGPA`.
4. **Match.** `POST /api/match` runs the stratified-balancing algorithm
   (`services/matching_engine.py`), producing one cohort per mentor.
5. **Edit incrementally.** Adding or removing a mentor row after a match
   triggers `POST /api/rebalance-add` / `POST /api/rebalance-remove` — only
   the affected students move; nobody else's assignment is disturbed.
   Removals go through the **Removal Decision Modal** first.
6. **Persist.** Saving the workspace (`POST /api/save-workspace`) writes the
   whole distribution into an isolated MongoDB database
   (`mm_<workspace_slug>`), **syncs the directory** — provisioning logins for
   new mentors/mentees, updating roster bindings, and purging mentors that
   were removed during rebalancing — and returns any newly generated
   temporary passwords.
7. **Use the portals.** Mentors see their roster and log meetings, mentees
   see their mentor and past logs, viewers inspect everything read-only.
8. **Audit.** Every add/remove is logged with exactly which students moved
   and from/to which mentor — viewable in a modal and downloadable as a
   standalone `.csv` from the **Audit Log** panel.

---

## 🗃️ Data model

Two tiers of MongoDB databases:

**Control DB — `mentor_mentee`**

| Collection   | Contents                                              |
|--------------|-------------------------------------------------------|
| `users`      | Global accounts (admin / mentor / mentee / viewer), hashed passwords |
| `workspaces` | Metadata for every saved run (slug, label, created-at, counts) |
| `sessions`   | Login tokens                                          |
| configs      | System-level settings such as submission deadlines    |

**Workspace DBs — `mm_<workspace_slug>`** (one per saved run)

A `directory` collection holding that run's mentors, mentees, credentials,
profiles and recorded session notes — fully isolated from every other
workspace, so dropping a run never touches another one.

---

## ⚙️ Backend (`backend/`)

### API surface

**Matching & files**

| Method | Endpoint                | Purpose                                                              |
|--------|-------------------------|-----------------------------------------------------------------------|
| POST   | `/api/parse-file`       | Upload a raw file → `{ mentors, mentees, mentees_normalized }`        |
| POST   | `/api/save-file`        | Serialize edited rows back out as a downloadable file                 |
| POST   | `/api/match`            | Run the full balancing algorithm → cohorts                            |
| POST   | `/api/rebalance-add`    | Add a mentor → `{ cohorts, new_mentor, students_pulled, sources }`     |
| POST   | `/api/rebalance-remove` | Remove a mentor → `{ cohorts, removed_mentor, students_reassigned, redistribution }` |

**Workspaces & persistence**

| Method | Endpoint                     | Purpose                                                    |
|--------|------------------------------|-------------------------------------------------------------|
| POST   | `/api/save-workspace`        | Snapshot to `mm_<workspace_slug>` + sync user credentials    |
| GET    | `/api/workspaces`            | List saved workspaces                                        |
| DELETE | `/api/workspaces/<db_name>`  | Drop a workspace database                                    |

**Portals**

| Method   | Endpoint                 | Purpose                                        |
|----------|--------------------------|-------------------------------------------------|
| GET      | `/api/my-cohort`         | Mentor portal roster fetch                      |
| GET      | `/api/my-profile`        | Mentee portal profile fetch                     |
| GET/POST | `/api/mentee-sessions`   | Fetch / create meeting notes for a mentee       |
| GET      | `/api/db-viewer/*`       | Read-only inspector routes for Viewer accounts  |

**Auth & admin**

| Method | Endpoint                    | Purpose                                     |
|--------|-----------------------------|----------------------------------------------|
| POST   | `/api/login`, `/api/logout` | Session lifecycle                            |
| GET    | `/api/me`                   | Current session state + role                 |
| POST   | `/api/change-password`      | Self-service password update                 |
| POST   | `/api/password-requests`    | Raise a reset request                        |
| GET/POST | `/api/password-requests/*` | Admin: list / approve reset requests        |
| GET/POST | `/api/deadline`           | Read / set the mentor log submission deadline |

`sources` / `redistribution` are per-mentor breakdowns of exactly which
students moved where — this is what feeds the Audit Log.

### Key modules

- **`services/format_converter.py`** — the multi-format input converter.
  Alias-maps arbitrary mentee column names onto
  `Student ID, Name, Section, CGPA` via `STUDENT_COLUMN_ALIASES`. No Flask
  dependency; reusable standalone or in tests.
- **`services/matching_engine.py`** — the stratified-balancing algorithm
  plus `add_mentor_rebalance` / `remove_mentor_rebalance` for incremental
  changes.
- **`routes/dataloader.py`** — universal file loader; auto-detects mentor
  vs. mentee data and runs mentees through the format converter.
- **`auth.py`** — password hashing, token issue/verify, and the **workspace
  directory sync** that reconciles the live distribution against the stored
  directory on every save.
- **`routes/Db_viewer_routes.py`** — read-only projections of a workspace
  for Viewer accounts; never exposes write paths or password material.

---

## ⚛️ React frontend (`front2/`)

### Run it

```bash
cd front2
npm install
npm run dev
```

Opens on `http://localhost:5173`. Make sure the backend and MongoDB are
running (see below). Full details — production build, deploying `dist/` as
a static site, and pointing at a non-local backend via
`?api=`/`localStorage`/`.env` — are in **`front2/README.md`**.

### Feature → file map

| Feature                             | Where it lives                                                |
|-------------------------------------|----------------------------------------------------------------|
| Login / session / role routing      | `hooks/useAuth.js` + `lib/auth.js` + `components/LoginPage.jsx` + `UserHome.jsx` |
| File uploads                        | `components/Sidebar.jsx` + `hooks/useMentorEngine.js`          |
| Editable mentor/mentee tables       | `components/DatasetEditor.jsx`                                 |
| Run match / incremental rebalance   | `hooks/useMentorEngine.js` (`runMatch`, the mentor-diff effect) |
| **Removal decision (redistribute vs. direct-map)** | `components/RemovalDecisionModal.jsx`           |
| Mentor-removal impact banner        | `components/ReallocationBanner.jsx`                            |
| Audit log (add/remove history)      | `components/AuditLog.jsx` + `lib/auditLog.js`                  |
| Results filtering/search            | `components/SearchFilterBar.jsx` + `lib/filterCohorts.js`      |
| Summary metrics                     | `components/MacroMetrics.jsx`                                  |
| Results display                     | `components/CohortsGrid.jsx` + `components/CohortCard.jsx`     |
| Exclude / buffer mentors            | `components/DatasetEditor.jsx` + `lib/api.js` + `lib/utils.js` |
| **Save / switch / drop workspaces** | `components/WorkspaceSelector.jsx`                             |
| **Generated credentials on sync**   | `components/NewCredentialsModal.jsx`                           |
| **Read-only database viewer**       | `components/DatabaseViewerPage.jsx` + `components/ViewerHome.jsx` |
| Mentor portal + session logger      | `components/MentorHome.jsx`                                    |
| Mentee portal + profile             | `components/MenteeHome.jsx` + `components/MenteeDetailModal.jsx` |
| Deadlines                           | `components/DeadlineBanner.jsx` + `components/DeadlinesPage.jsx` |
| Password reset flow                 | `ForgotPasswordPage.jsx` + `PasswordRequestsPage.jsx` + `ChangePasswordPage.jsx` |

---

## 👤 Roles & portals

| Role       | Can do                                                                                     |
|------------|---------------------------------------------------------------------------------------------|
| **Admin**  | Upload datasets, run and rebalance matches, manage buffer mentors, set deadlines, approve password resets, save/publish and drop workspaces |
| **Mentor** | View assigned mentee roster, open student contact cards, log meeting sessions               |
| **Mentee** | View assigned mentor profile and contact details, read past meeting logs                    |
| **Viewer** | Read-only inspection of saved datasets, cohort metrics and mentor session progress — no edits |

Seed the first accounts with `backend/routes/create_admin.py` and
`backend/routes/create_viewer.py`.

---

## 🗄️ Legacy vanilla-JS frontend (`index.html` + `js/`)

No build step — open `index.html` directly (or serve it statically) with the
backend running. Script load order matters and is fixed in `index.html`:
`state.js` → `utils.js` → `api.js` → feature modules (`datasetEditor.js`,
`reallocationReport.js`, `matching.js`, `filters.js`). It covers the core
matching flow only and isn't where new work happens.

---

## ✨ Feature notes

- **Multi-format input converter** — uploads don't need to be pre-formatted.
  A student sheet with `USN`/`Student Name`/`Batch`/`SGPA` columns (in any
  order) is automatically mapped onto the canonical schema before it reaches
  the matching engine. The UI surfaces a "columns auto-mapped to Student ID /
  Name / Section / CGPA" status note when it happens.
- **Mentor exclusion / buffer mentors** — mentors can be marked as excluded
  from assignment, either on the first run or during any rerun.
- **Removal Decision Modal** — removing a mentor opens a decision dialog:
  either redistribute the orphaned cohort across all remaining active
  mentors with the balancing algorithm, or direct-map the entire cohort to
  one chosen target mentor. The choice is applied before the rebalance runs.
- **🆕 Database sync on removal & reallocation** — reallocations are no
  longer frontend-only. When mentors are removed and students are moved,
  saving the workspace pushes the change straight into
  `mm_<workspace_slug>`: roster bindings are rewritten, the removed mentor's
  directory entry and credentials are purged, and mentees are re-bound to
  their new mentor. Mentor and mentee portals reflect the new assignment on
  their next load — no manual database cleanup.
- **🆕 Database Viewer page** — a read-only inspector (`DatabaseViewerPage.jsx`,
  backed by `/api/db-viewer/*`) for browsing a saved workspace: every
  mentor–mentee match, cohort metrics, and session-logging progress. Viewer
  accounts land here via `ViewerHome.jsx` and cannot edit anything; admins
  can open it too as a quick "what's actually in the DB right now?" check.
- **Audit log** — every mentor addition/removal is recorded with a timestamp,
  an expandable per-student detail table, and a one-click CSV download.
- **Deadlines** — admins set a countdown for mentor log submissions; a banner
  surfaces it across the mentor portal.
- **Password self-service** — mentees/mentors raise reset requests; admins
  approve them from the requests queue, and temporary passwords are shown
  once in the credentials modal.

---

## 🔐 Authentication & Database

- Registration/seeding, login and logout with hashed passwords
- Session/JWT-based auth; protected endpoints require a valid token
- MongoDB persists user accounts, workspace metadata, uploaded datasets,
  saved mentor distributions, session notes and audit history

By default the backend expects a MongoDB instance running locally:

```text
mongodb://localhost:27018
```

Any remote MongoDB deployment works — change the connection string in your
environment variables.

---

## ⚙️ Backend Setup

### 1. Create a virtual environment

```bash
python -m venv .venv
```

Activate it.

Windows:

```bash
.venv\Scripts\activate
```

macOS/Linux:

```bash
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file inside `backend/`.

Example:

```env
MONGO_URI=mongodb://localhost:27018
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
FLASK_ENV=development
```

Add any additional variables required by your deployment.

### 4. Start MongoDB

```bash
mongod --port 27018 --dbpath mongo-data
```

Wait until MongoDB reports:

```text
Waiting for connections
```

### 5. Seed the first accounts

```bash
python -m routes.create_admin
python -m routes.create_viewer
```

### 6. Start the backend

```bash
python app.py
```

The Flask server will start on:

```
http://127.0.0.1:5001
```

---

## 📦 Backend Dependencies

Dependencies are managed through `requirements.txt`.

Install everything with:

```bash
pip install -r requirements.txt
```

If you add new Python packages:

```bash
pip freeze > requirements.txt
```

to regenerate the dependency list.
