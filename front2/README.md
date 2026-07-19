# Mentor Distribution Engine — React Frontend

This is a React (Vite) port of the original vanilla-JS `index.html` +
`js/*.js` frontend. Same UI, same behavior, same backend contract — just
rebuilt as React components with state instead of DOM manipulation.

It's a **frontend only**. It talks to the existing Flask backend
(`app.py` + `routes/`) over HTTP exactly as before — nothing on the backend
needs to change.

## Run it

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. Make sure the Flask backend is running
separately: `python app.py` (defaults to `http://127.0.0.1:5001`).

## Build for production

```bash
npm run build   # outputs to dist/
npm run preview # serve the production build locally to sanity-check it
```

`dist/` is a plain static bundle — deploy it anywhere (Netlify, Vercel,
GitHub Pages, S3, nginx, etc.), same as any static site.

## Pointing at a different backend

See `src/config.js`. Resolution order:
1. `?api=https://your-backend.com` in the URL (remembered after that)
2. `localStorage.setItem('API_BASE', 'https://your-backend.com')`
3. `VITE_API_BASE` in a `.env` file (copy `.env.example`) — baked in at build time
4. Falls back to `http://127.0.0.1:5001` for local dev

## Structure

```
src/
  config.js                 backend URL resolution
  lib/
    api.js                   fetch() calls to the Flask backend (1:1 port of js/api.js)
    utils.js                 getField/buildMentorNameMap/etc. (port of utils.js + state.js)
    filterCohorts.js          pure search/filter logic (port of filters.js's renderCohorts)
  hooks/
    useMentorEngine.js        all shared app state + business logic
                               (port of state.js + datasetEditor.js + matching.js +
                               reallocationReport.js's non-DOM logic)
  components/
    Sidebar.jsx                file uploads + "Execute Balancing" button
    DatasetEditor.jsx           editable mentors/mentees preview tables
    ReallocationBanner.jsx      mentor-removal report banner
    MacroMetrics.jsx            the 4 summary metric tiles
    SearchFilterBar.jsx         search + filter + view-limit controls
    CohortsGrid.jsx             results grid (loading/error/empty states)
    CohortCard.jsx               one mentor's roster card
  App.jsx                      wires it all together (port of the <body> markup)
  index.css                    same stylesheet as the original, unchanged
```

## What changed vs. the vanilla-JS version

- **State**: global `let` variables (`mentorsData`, `lastCohorts`, etc.) are
  now React state in `useMentorEngine()`. DOM lookups (`document.getElementById`)
  are gone — everything is props/state.
- **Incremental mentor rebalancing**: the effect that watches for mentor-table
  edits (renames/adds/removals) and calls `/api/rebalance-add` /
  `/api/rebalance-remove` runs as a `useEffect` keyed on `mentorsData`, instead
  of being called manually after each table edit event.
- **Everything else — endpoints, payload shapes, filtering rules, CSS — is
  unchanged.**
