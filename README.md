# Mentor Distribution Engine

A proportional-fair mentor/mentee matching tool: upload a mentor roster and
a student database, run a stratified-balancing algorithm (by grade
boundary, section, and CGPA), then add,remove or exclude mentors afterwards and
watch the engine rebalance incrementally instead of reshuffling everyone.

The project has one Flask backend and **two** interchangeable frontends:
a React (Vite) app (`front2/`, the actively developed one) and the
original vanilla-JS app (`index.html` + `js/`, kept for reference). Both
talk to the same backend over the same HTTP contract — pick whichever you
want to run; you don't need both.

---

## 📁 Directory structure

```text
integrate/
├── README.md                    # ← you are here
│
├── backend/                     # Flask API — shared by both frontends
│   ├── app.py                   # Entrypoint: creates the app, enables CORS, registers blueprints
│   ├── routes/
│   │   ├── dataloader.py        # Universal upload parser + mentor/mentee auto-detection
│   │   ├── file_routes.py       # POST /api/parse-file, POST /api/save-file
│   │   └── match_routes.py      # POST /api/match, /api/rebalance-add, /api/rebalance-remove
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
│       ├── App.jsx              # Top-level layout; wires hook + components together
│       ├── config.js            # Resolves API_BASE (query param → localStorage → .env → default)
│       ├── index.css            # Full stylesheet (design tokens, layout, components)
│       ├── hooks/
│       │   └── useMentorEngine.js   # All shared app state + business logic (the "brain")
│       ├── lib/
│       │   ├── api.js               # Every fetch() call to the Flask backend
│       │   ├── utils.js             # getField/extractMentorsList/extractStudentsList/etc.
│       │   ├── filterCohorts.js     # Pure search/filter/view-limit logic for results
│       │   └── auditLog.js          # Normalizes add/remove payloads into one event shape
│       └── components/
│           ├── Sidebar.jsx              # File uploads + "Execute Balancing" + Audit Log
│           ├── DatasetEditor.jsx        # Editable mentors/mentees preview tables
│           ├── ReallocationBanner.jsx   # One-off "mentor removed, here's who moved" banner
│           ├── AuditLog.jsx             # Persistent, downloadable add/remove history
│           ├── MacroMetrics.jsx         # The 4 summary metric tiles
│           ├── SearchFilterBar.jsx      # Search + filter + view-limit controls
│           ├── CohortsGrid.jsx          # Results grid (loading/error/empty states)
│           └── CohortCard.jsx           # One mentor's roster card
│
├── index.html                   # 🗄️ Legacy vanilla-JS frontend — kept for reference
└── js/                           # (same features, same backend contract, no build step)
    ├── state.js                  # Global state + cached DOM refs (must load first)
    ├── utils.js                  # Generic helpers
    ├── api.js                    # fetch() layer
    ├── datasetEditor.js          # Upload handling + editable tables
    ├── matching.js               # Run match, incremental add/remove
    ├── reallocationReport.js     # Mentor-removal impact banner
    └── filters.js                # Search/sort/pagination for results
```

> **Which frontend should I run?** Use `front2/` — it's the maintained
> React version. The root `index.html`/`js/` vanilla version is kept
> side-by-side purely as a lighter-weight, no-build-step reference/fallback
> and receives the same features, but `front2/` is where active
> development happens.

---

## 🧠 How it works, end to end

1. **Upload.** A mentor roster and a student database go up via
   `POST /api/parse-file` — as one combined workbook/SQL dump, or as two
   separate files. Accepts `.csv`, `.txt`, `.xlsx`, `.xls`, `.sql`.
2. **Auto-detect & normalize.** `dataloader.py` figures out which
   sheet/table is mentors vs. mentees (by name, then by column signature),
   then runs the mentee dataset through the **multi-format input
   converter** (`services/format_converter.py`), which maps whatever
   column names/order the source used (`USN`, `SGPA`, `Batch`, ...) onto
   the canonical schema: `Student ID, Name, Section, CGPA`.
3. **Match.** `POST /api/match` runs the stratified-balancing algorithm
   (`services/matching_engine.py`), producing one cohort per mentor.
4. **Edit incrementally.** Renaming, adding, or removing a mentor row in
   the UI after a match triggers `POST /api/rebalance-add` /
   `POST /api/rebalance-remove` — only the affected students move; nobody
   else's assignment is disturbed.
5. **Audit.** Every add/remove is logged with exactly which students moved
   and from/to which mentor — viewable in a modal and downloadable as a
   standalone `.csv` from the **Audit Log** panel.

---

## ⚙️ Backend (`backend/`)

### Run it

```bash
cd backend
pip install flask flask_cors pandas openpyxl
python app.py
```

Runs on `http://127.0.0.1:5001` by default (see `app.run(port=5001, ...)`
in `app.py`).

### API surface

| Method | Endpoint               | Purpose                                                              |
|--------|------------------------|-----------------------------------------------------------------------|
| POST   | `/api/parse-file`      | Upload a raw file → `{ mentors, mentees, mentees_normalized }`        |
| POST   | `/api/save-file`       | Serialize edited rows back out as a downloadable file                 |
| POST   | `/api/match`            | Run the full balancing algorithm → cohorts                            |
| POST   | `/api/rebalance-add`    | Add a mentor → `{ cohorts, new_mentor, students_pulled, sources }`     |
| POST   | `/api/rebalance-remove` | Remove a mentor → `{ cohorts, removed_mentor, students_reassigned, redistribution }` |

`sources` / `redistribution` are per-mentor breakdowns of exactly which
students moved where — this is what feeds the Audit Log on both
frontends.

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

---

## ⚛️ React frontend (`front2/`)

### Run it

```bash
cd front2
npm install
npm run dev
```

Opens on `http://localhost:5173`. Make sure the backend is running
separately (see above). Full details — production build, deploying `dist/`
as a static site, and pointing at a non-local backend via
`?api=`/`localStorage`/`.env` — are in **`front2/README.md`**.

### Feature → file map

| Feature                        | Where it lives                                              |
|---------------------------------|--------------------------------------------------------------|
| File uploads                    | `components/Sidebar.jsx` + `hooks/useMentorEngine.js`         |
| Editable mentor/mentee tables   | `components/DatasetEditor.jsx`                                |
| Run match / incremental rebalance | `hooks/useMentorEngine.js` (`runMatch`, the mentor-diff effect) |
| Mentor-removal impact banner    | `components/ReallocationBanner.jsx`                           |
| **Audit log (add/remove history)** | `components/AuditLog.jsx` + `lib/auditLog.js`              |
| Results filtering/search        | `components/SearchFilterBar.jsx` + `lib/filterCohorts.js`     |
| Summary metrics                 | `components/MacroMetrics.jsx`                                 |
| Results display                 | `components/CohortsGrid.jsx` + `components/CohortCard.jsx`    |
| Exclude mentors                 | `components/DatasetEditor.jsx` + `lib/api.js` +`lib/utils.js` |
| Reassign mentees manually       | `components/ReallocationBanner.jsx`  + button to do it directly   |



---

## 🗄️ Legacy vanilla-JS frontend (`index.html` + `js/`)

No build step — open `index.html` directly (or serve it statically) with
the backend running. Script load order matters and is fixed in
`index.html`: `state.js` → `utils.js` → `api.js` → feature modules
(`datasetEditor.js`, `reallocationReport.js`, `matching.js`, `filters.js`).
Kept in sync feature-for-feature with `front2/`, but isn't where new work
happens.

---

## ✨ Feature notes

- **Multi-format input converter** — uploads no longer need to be
  pre-formatted. A student sheet with `USN`/`Student Name`/`Batch`/`SGPA`
  columns (in any order) is automatically mapped onto the canonical
  schema before it reaches the matching engine. The UI surfaces this with
  a "columns auto-mapped to Student ID / Name / Section / CGPA" status
  note when it happens.
- **Audit log** — every mentor addition/removal is recorded with a
  timestamp, an expandable per-student detail table, and a one-click CSV
  download — independent of whatever the main results view currently
  shows.
- **Mentor exclusion/Buffer Mentors** — Now mentors can be chosen to be 
   excluded from being assigned mentees during first run or can be excluded
   during reruns of the matching
- **Direct Mapped to a different mentor** — when a mentor is removed now 
   user can ensure that all the mentees from the prev mentor can be assigned
   to a single mentor
