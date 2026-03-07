# How to Fetch Analytics Data from `api.php` in the Reporting Dashboard

> **Status:** Implementation in progress — `analytics.js` created, `index.html` wired.  
> **Audience:** Developers working on `reporting/` who want to replace the
> hardcoded placeholder values in `index.html` with live data from MySQL.

## Current Task — What Is Being Implemented

The goal is to replace all hardcoded placeholder numbers in `reporting/index.html`
with real data fetched from `api.php` at runtime, using a new ES-module file
`reporting/analytics.js`.

### High-Level Task Breakdown

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Create the `.agent.md` for this agent | `.github/analytics-dashboard.agent.md` | ✅ Done |
| 2 | Document architecture + task plan (this section) | `how_to_fetch.md` | ✅ Done |
| 3 | Create `analytics.js` — `apiFetch`, `renderKPIs`, `renderTrafficChart`, `renderTopPages` | `reporting/analytics.js` | ✅ Done |
| 4 | Update `index.html` — add `data-kpi` hooks, Chart.js CDN, `<script type="module">` | `reporting/index.html` | ✅ Done |
| 5 | (Future) Add Web Vitals, Errors, Technographics panels | `reporting/analytics.js` | 🔲 Pending |
| 6 | (Future) Move DB credentials out of `api.php` | server-side config | 🔲 Pending |
| 7 | (Future) Add authentication to `api.php` write endpoints | `reporting/api.php` | 🔲 Pending |

### What `analytics.js` Does, Concretely

1. **`apiFetch(path)`** — calls `fetch('/api' + path)`, validates `Content-Type`,
   returns parsed JSON; throws on HTTP errors.
2. **`renderKPIs(pageviews, sessions)`** — writes real numbers into the four
   `.kpi-value` elements identified by `data-kpi="pageviews|visitors|bounce|session"`.
3. **`renderTrafficChart(pageviews)`** — buckets `received_at` timestamps into
   daily counts over the last 30 days and passes them to Chart.js on `#trafficChart`.
4. **`renderTopPages(pageviews)`** — groups pageview rows by `url`, sorts by
   frequency, and replaces `<tbody>` with real top-10 rows.
5. **`init()`** — fires on `DOMContentLoaded`, fetches `/api/pageviews` and
   `/api/sessions` in parallel via `Promise.all`, calls the render functions.

---

## 1. System Overview

```
┌─────────────────────────┐        POST /log        ┌──────────────────────────────┐
│  test.teamate.site       │ ───────────────────────▶ │  collector.teamate.site       │
│  (collector.js embedded) │   sendBeacon / fetch    │  log.php  →  MySQL            │
└─────────────────────────┘                          │  DB: collector_db             │
                                                     └──────────────┬───────────────┘
                                                                    │  same DB
                                                                    ▼
                                                     ┌──────────────────────────────┐
                                                     │  reporting.teamate.site       │
                                                     │  api.php  (REST, read/write)  │
                                                     │  index.html + analytics JS    │
                                                     └──────────────────────────────┘
```

**Key fact:** `index.html` and `api.php` are **both deployed to the same Apache
vhost** (`reporting.teamate.site`).  
That means all `fetch()` calls from the dashboard JS are **same-origin** — no
CORS configuration is needed for the reporting dashboard itself.

---

## 2. Available API Endpoints

All routes live under `/api/` on `reporting.teamate.site`.

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/api/pageviews` | Array of all pageview records (supports `?limit=` & `?offset=`) |
| `GET` | `/api/pageviews/{id}` | Single pageview row |
| `GET` | `/api/sessions` | Aggregated session list |
| `GET` | `/api/sessions/{id}` | All pageviews belonging to one `session_id` |
| `GET` | `/api/vitals` | All Web Vitals rows (LCP, CLS, INP) |
| `GET` | `/api/vitals/{id}` | Web Vitals for a specific pageview |
| `GET` | `/api/errors` | All rows where `error_count > 0` |
| `GET` | `/api/errors/{id}` | Error row for a specific pageview |
| `GET` | `/api/technographics` | All device/browser fingerprint rows |
| `GET` | `/api/technographics/{id}` | Technographics for a specific pageview |

Every response is `Content-Type: application/json`.  
Collection endpoints return: `{ total, limit, offset, data: [...] }`.

---

## 3. Recommended Architecture for `reporting/`

### 3a. New file: `reporting/analytics.js`

Create a dedicated module that owns all data-fetching and DOM-update logic.
`index.html` simply loads it with `<script type="module" src="analytics.js">`.

**Responsibilities of `analytics.js`:**
1. Define a thin `apiFetch(path)` helper (handles errors, parses JSON).
2. Export (or directly invoke) one `init()` function that fires on
   `DOMContentLoaded`.
3. Call the endpoints in parallel with `Promise.all` to avoid serial waterfall.
4. Hand the returned data to rendering helpers that update the DOM / feed
   Chart.js datasets.

### 3b. Structural sketch (pseudocode — not yet implemented)

```js
// reporting/analytics.js  (to be created)

const BASE = '/api';   // same-origin; no hostname needed

async function apiFetch(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

async function init() {
  const [pageviews, sessions, vitals, errors, tech] = await Promise.all([
    apiFetch('/pageviews?limit=500'),
    apiFetch('/sessions'),
    apiFetch('/vitals'),
    apiFetch('/errors'),
    apiFetch('/technographics'),
  ]);

  renderKPIs(pageviews, sessions);     // update .kpi-value cards
  renderTrafficChart(pageviews);       // feed Canvas / Chart.js
  renderTopPages(pageviews);           // replace hardcoded table rows
  renderVitals(vitals);                // LCP / CLS / INP widgets
  renderErrors(errors);                // error-rate section
  renderTechnographics(tech);          // browser / device breakdown
}

document.addEventListener('DOMContentLoaded', init);
```

### 3c. How each dashboard widget maps to an endpoint

| Dashboard widget | Endpoint to call | Fields to use |
|-----------------|-----------------|---------------|
| **Page Views** KPI card | `GET /api/pageviews` | `total` from response envelope |
| **Unique Visitors** KPI | `GET /api/sessions` | count of distinct `session_id` |
| **Bounce Rate** KPI | `GET /api/sessions` | sessions with only 1 pageview ÷ total |
| **Avg. Session** KPI | `GET /api/sessions` | derive from `page_entered_at` / `page_left_at` |
| **Traffic Over Time** chart | `GET /api/pageviews?limit=1000` | bucket `received_at` by day |
| **Top Pages** table | `GET /api/pageviews` | group/count by `url` |
| **Web Vitals** panel | `GET /api/vitals` | `vital_lcp`, `vital_cls`, `vital_inp` |
| **Error breakdown** | `GET /api/errors` | `error_count` per page |
| **Browsers / Devices** | `GET /api/technographics` | `user_agent`, `screen_width`, etc. |

---

## 4. Step-by-Step Implementation Plan

```
Step 1 ── Enable CORS in api.php (only if you need cross-origin access)
Step 2 ── Create reporting/analytics.js with apiFetch helper
Step 3 ── Wire DOMContentLoaded → init()
Step 4 ── Implement renderKPIs() — replace hardcoded .kpi-value text
Step 5 ── Implement renderTrafficChart() — feed real data into Chart.js canvas
Step 6 ── Implement renderTopPages() — replace hardcoded <tbody> rows
Step 7 ── (Optional) Add loading spinners / skeleton screens while fetching
Step 8 ── (Optional) Add error banners shown when apiFetch() throws
Step 9 ── Deploy via git push → CI/CD pipeline runs deploy.yml → rsync to server
```

---

## 5. CORS — When You Actually Need It

CORS headers in `api.php` are currently **commented out**.

| Scenario | CORS needed? |
|----------|-------------|
| `reporting/index.html` + `api.php` on same origin (`reporting.teamate.site`) | **No** — same-origin |
| A future separate dashboard on a different domain calling `api.php` | **Yes** — uncomment `Access-Control-Allow-Origin` block |
| `collector.js` on `test.teamate.site` calling `reporting.teamate.site/api` | **Yes** (but collector should only call `collector.teamate.site/log`) |

To enable CORS for the reporting vhost, uncomment the block in `api.php` and
add `reporting.teamate.site` to the `$allowed_origins` array.  
Only allow the specific origins you trust — **not** `*`.

---

## 6. Pagination Strategy

`GET /api/pageviews` accepts `?limit=` (max 1000) and `?offset=`.  
For dashboards, a single call with `limit=1000` covers most datasets.  
For larger datasets, implement cursor-based pagination:

```js
async function fetchAll(path) {
  const PAGE = 500;
  let offset = 0, rows = [], total = Infinity;
  while (rows.length < total) {
    const r = await apiFetch(`${path}?limit=${PAGE}&offset=${offset}`);
    total = r.total;
    rows.push(...r.data);
    offset += PAGE;
  }
  return rows;
}
```

---

## 7. Security Checklist

- [ ] **Credentials:** `DB_PASS` is hardcoded in `api.php`. Move to a PHP
      `config.php` outside the webroot (`/etc/reporting/db.php`) and
      `require` it — do not commit secrets to git.
- [ ] **Authentication:** `api.php` has no auth layer. Add session-cookie or
      Bearer-token checks before exposing write endpoints (`POST`, `PUT`,
      `DELETE`) — or restrict write methods to `localhost` at the Apache level.
- [ ] **HTTPS:** All traffic must be TLS — `fetch()` to a plain `http://`
      endpoint from an `https://` page is blocked by mixed-content policy.
- [ ] **Input validation:** `apiFetch` should validate that the response
      `Content-Type` is `application/json` before calling `.json()`.

---

## 8. Files to Create / Modify

| Action | File | Notes |
|--------|------|-------|
| **Create** | `reporting/analytics.js` | Main fetch + render module |
| **Modify** | `reporting/index.html` | Add `<script type="module" src="analytics.js">`, add loading states |
| **Modify** | `reporting/api.php` | Uncomment CORS block if needed; move credentials to config |
| **Create** | `reporting/config.php` (server-side only) | DB credentials outside webroot |

> All changes to `reporting/` are automatically deployed by
> `.github/workflows/deploy.yml` when pushed to `main`
> (via `rsync` to `/var/www/reporting.teamate.site/public_html`).

---

## 9. Quick Test (cURL)

Before writing any JS, verify the API works from the server:

```bash
# From your local machine (replace with your server IP or domain):
curl -s "https://reporting.teamate.site/api/pageviews?limit=5" | python3 -m json.tool

# Expected shape:
# {
#   "total": 1234,
#   "limit": 5,
#   "offset": 0,
#   "data": [ { "id": ..., "url": ..., ... }, ... ]
# }
```

---
