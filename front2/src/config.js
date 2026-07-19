// ---------------------------------------------------------------------------
// config.js
//
// The ONLY place you need to touch when deploying this frontend somewhere
// other than your own machine. Resolution order (first match wins):
//
//   1. ?api=https://your-backend.com  in the page URL (remembered afterwards)
//   2. localStorage.setItem('API_BASE', 'https://your-backend.com')
//   3. VITE_API_BASE in a .env file (baked in at build time)
//   4. the DEFAULT_API_BASE fallback below (local dev)
// ---------------------------------------------------------------------------

const DEFAULT_API_BASE = 'http://127.0.0.1:5001';

function resolveApiBase() {
  if (typeof window === 'undefined') return DEFAULT_API_BASE;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('api');
  if (fromQuery) {
    window.localStorage.setItem('API_BASE', fromQuery);
    return fromQuery;
  }

  const fromStorage = window.localStorage.getItem('API_BASE');
  if (fromStorage) return fromStorage;

  return import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;
}

export const API_BASE = resolveApiBase();
