# Web Performance Page — Implementation Plan
**Target file:** `performance.html`  
**Scope:** Tier 1 (Core Web Vitals) → Tier 2 (Operational Diagnostics) → Tier 3 (Business Impact Correlations) + Request Waterfall  
**Data source:** Browser Performance APIs (no external SDK required unless noted)

---

## Overview

Implement a self-contained performance analytics page that collects real metrics from the browser, displays them live, and correlates them to business outcomes. All data collection uses native Web APIs available in modern browsers. No backend is required for Tier 1 and Tier 2. Tier 3 requires session storage or a lightweight backend endpoint to aggregate cross-session data.

The page exposes two **global filter controls** that affect every section simultaneously:

- **Time Range Selector** — toggle between `1D`, `7D`, and `30D` windows. All metrics, charts, tables, and aggregates re-render to reflect only data collected within the selected window.
- **Page Selector** — a dropdown listing every tracked page (e.g. `index.html`, `products.html`, `product-detail.html`). Selecting a page scopes all data to sessions recorded on that URL only. A special "All Pages" option shows aggregate data across the entire site.

Both controls live in the page header and are always visible. Every data-fetch or render function must read the current values of these two filters before querying or displaying data.

---

## Keep these features:
- Underperforming pages section: This <section aria-labelledby="underperf-heading" class="table-section"> was great and useful, so keep it. For the JS Errors, please specify the number of unique errors and priotize the ones with a high amounts
- Hovering tooltip + Vertical line: Keep these implementation, they are important to help users look at which data they are looking at

## Global Controls — Time Range & Page Selector

### What to implement

Two persistent UI controls rendered in the page header that act as global filters. Every metric, chart, table, and aggregate on the page must re-render whenever either control changes.

| Control | Type | Options |
|---|---|---|
| Time Range | Button toggle | `1D` (24 hrs), `7D`, `30D` |
| Page Selector | `<select>` dropdown | "All Pages" + one entry per tracked URL |

### How to implement

#### Global filter state
```javascript
// Single source of truth — read this in every render function
const filters = {
  days: 1,       // active window: 1 | 7 | 30
  page: 'all',   // 'all' | '/index.html' | '/products.html' | etc.
};
```

#### HTML structure
```html
<!-- Place inside the page <header> -->
<div class="global-controls">

  <!-- Time range toggle -->
  <div class="time-filter" role="group" aria-label="Time range">
    <button data-days="1"  class="active">1D</button>
    <button data-days="7">7D</button>
    <button data-days="30">30D</button>
  </div>

  <!-- Page selector dropdown -->
  <select data-page-select aria-label="Select page">
    <option value="all">All Pages</option>
    <!-- Populated dynamically from stored session data -->
  </select>

  <!-- Active filter label displayed in the header subtitle -->
  <span data-filter-label>All Pages · Last 24 hours</span>

</div>
```

#### Time range toggle wiring
```javascript
document.querySelectorAll('[data-days]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-days]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filters.days = parseInt(btn.dataset.days, 10);
    refreshAllSections();
  });
});
```

#### Page selector — populate from stored sessions
```javascript
function populatePageSelector(sessions) {
  const select = document.querySelector('[data-page-select]');
  if (!select) return;

  const pages = [...new Set(sessions.map(s => s.url))].sort();
  const current = select.value;

  select.innerHTML = `<option value="all">All Pages</option>` +
    pages.map(p =>
      `<option value="${p}"${p === current ? ' selected' : ''}>${p}</option>`
    ).join('');
}

document.querySelector('[data-page-select]')?.addEventListener('change', (e) => {
  filters.page = e.target.value;
  refreshAllSections();
});
```

#### Core filter helper — use in every render function
```javascript
/**
 * Returns only sessions that fall within the active time window
 * AND match the selected page (or all pages if filters.page === 'all').
 * Pass this result to all render functions — never pass raw sessions directly.
 */
function getFilteredSessions(allSessions) {
  const cutoff = Date.now() - filters.days * 24 * 60 * 60 * 1000;
  return allSessions.filter(s =>
    s.ts >= cutoff &&
    (filters.page === 'all' || s.url === filters.page)
  );
}
```

#### Master refresh function — called on every filter change
```javascript
function refreshAllSections() {
  const sessions = getFilteredSessions(loadAllSessions());

  // Tier 1
  renderVitalsFromSessions(sessions);

  // Tier 2
  renderResourceBreakdownFromSessions(sessions);
  renderSlowestRequestsFromSessions(sessions);
  renderWaterfallFromSessions(sessions);

  // Tier 3
  renderDeviceSegment(sessions);
  renderConversionBySpeed(sessions);
  renderGeoBreakdown(sessions);

  // Update header label
  const pageLabel = filters.page === 'all' ? 'All Pages' : filters.page;
  const dayLabel  = filters.days === 1 ? 'Last 24 hours' : `Last ${filters.days} days`;
  document.querySelector('[data-filter-label]').textContent = `${pageLabel} · ${dayLabel}`;
}
```

#### Vitals aggregation across sessions (Tier 1 variant)
When displaying Tier 1 metrics for a time window (not just the current live page load), compute the **P75 value** across all matching sessions rather than a single live reading:

```javascript
function p75(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)];
}

function renderVitalsFromSessions(sessions) {
  const metrics = ['lcp', 'fcp', 'ttfb', 'cls', 'inp'];
  const thresholds = {
    lcp:  [2500, 4000],
    fcp:  [1800, 3000],
    ttfb: [800,  1800],
    cls:  [0.1,  0.25],
    inp:  [200,  500],
  };

  for (const metric of metrics) {
    const values = sessions.map(s => s[metric]).filter(v => v != null);
    const value  = p75(values);
    if (value == null) { showEmptyState(`[data-vital="${metric.toUpperCase()}"]`, 'No data'); continue; }
    const [good, poor] = thresholds[metric];
    renderVital(metric.toUpperCase(), value, good, poor);
  }
}
```

#### Empty state — show when no sessions match filters
```javascript
function showEmptyState(selector, message = 'No data for this filter') {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = `<div class="empty-state">${message}</div>`;
}
```

---

## Tier 1 — Core Web Vitals

### What to implement
| Metric | Full Name | Good Threshold |
|---|---|---|
| LCP | Largest Contentful Paint | < 2.5s |
| INP | Interaction to Next Paint | < 200ms |
| CLS | Cumulative Layout Shift | < 0.1 |
| FCP | First Contentful Paint | < 1.8s |
| TTFB | Time to First Byte | < 800ms (target < 200ms) |

Each metric must display:
- Current value with unit (ms or score)
- Status label: GOOD / NEEDS WORK / POOR (color-coded: green / amber / red)
- Threshold reference text
- A sparkline trend chart (last 10 readings stored in sessionStorage)

### How to implement

**Install the web-vitals library (recommended) OR use raw PerformanceObserver.**

#### Option A — web-vitals npm package (preferred)
```html
<script type="module">
  import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'https://unpkg.com/web-vitals@4/dist/web-vitals.attribution.js';

  onLCP(metric  => renderVital('LCP',  metric.value, 2500, 4000));
  onINP(metric  => renderVital('INP',  metric.value, 200,  500));
  onCLS(metric  => renderVital('CLS',  metric.value, 0.1,  0.25));
  onFCP(metric  => renderVital('FCP',  metric.value, 1800, 3000));
  onTTFB(metric => renderVital('TTFB', metric.value, 800,  1800));
</script>
```

#### Option B — Raw PerformanceObserver (no dependencies)
```javascript
// LCP
new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const lcp = entries[entries.length - 1];
  renderVital('LCP', lcp.startTime, 2500, 4000);
}).observe({ type: 'largest-contentful-paint', buffered: true });

// FCP
new PerformanceObserver((list) => {
  const fcp = list.getEntriesByName('first-contentful-paint')[0];
  if (fcp) renderVital('FCP', fcp.startTime, 1800, 3000);
}).observe({ type: 'paint', buffered: true });

// CLS — must accumulate all session entries
let clsValue = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) clsValue += entry.value;
  }
  renderVital('CLS', clsValue, 0.1, 0.25);
}).observe({ type: 'layout-shift', buffered: true });

// TTFB — from Navigation Timing
window.addEventListener('load', () => {
  const nav = performance.getEntriesByType('navigation')[0];
  renderVital('TTFB', nav.responseStart - nav.requestStart, 800, 1800);
});

// INP — requires event-timing observer
let maxInp = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > maxInp) {
      maxInp = entry.duration;
      renderVital('INP', maxInp, 200, 500);
    }
  }
}).observe({ type: 'event', buffered: true, durationThreshold: 16 });
```

#### renderVital() helper
```javascript
function renderVital(name, value, goodThreshold, poorThreshold) {
  const status = value <= goodThreshold ? 'good'
               : value <= poorThreshold ? 'warn'
               : 'bad';

  // Update DOM card: value, status label, color class
  const card = document.querySelector(`[data-vital="${name}"]`);
  if (!card) return;
  card.querySelector('.vital-value').textContent = name === 'CLS'
    ? value.toFixed(3)
    : Math.round(value);
  card.className = `vital-card ${status}`;
  card.querySelector('.vital-status').textContent =
    status === 'good' ? '✓ GOOD' : status === 'warn' ? '⚠ NEEDS WORK' : '✗ POOR';

  // Persist to sparkline history
  const key = `spark_${name}`;
  const history = JSON.parse(sessionStorage.getItem(key) || '[]');
  history.push(Math.round(value));
  if (history.length > 10) history.shift();
  sessionStorage.setItem(key, JSON.stringify(history));
  renderSparkline(name, history);
}
```

---

## Tier 2 — Operational Diagnostics

### What to implement

1. **Resource Load Breakdown** — total transfer size and load time per resource type (JS, CSS, Images, Fonts, API/XHR, Other)
2. **Slowest Requests Table** — top 8 slowest resources with name, type, and duration
3. **Request Waterfall** — horizontal timeline showing each resource's start time and duration relative to page load
4. **Summary stats** — total requests, total transfer size, cache hit rate

### How to implement

#### 2a. Resource Timing API — the foundation for all Tier 2 data
```javascript
window.addEventListener('load', () => {
  // Wait one tick so all entries are flushed
  setTimeout(() => {
    const resources = performance.getEntriesByType('resource');
    processResources(resources);
  }, 0);
});

function getResourceType(entry) {
  const url = entry.name;
  const init = entry.initiatorType;
  if (init === 'xmlhttprequest' || init === 'fetch') return 'API';
  if (/\.js(\?|$)/.test(url)) return 'JS';
  if (/\.css(\?|$)/.test(url)) return 'CSS';
  if (/\.(woff2?|ttf|eot|otf)/.test(url)) return 'Font';
  if (/\.(png|jpe?g|gif|webp|svg|avif)/.test(url)) return 'Image';
  return 'Other';
}

function processResources(resources) {
  const typeMap = { JS: 0, CSS: 0, Image: 0, Font: 0, API: 0, Other: 0 };
  const sizeMap = { JS: 0, CSS: 0, Image: 0, Font: 0, API: 0, Other: 0 };
  let cached = 0;

  for (const r of resources) {
    const type = getResourceType(r);
    typeMap[type] += r.duration;
    sizeMap[type] += r.transferSize || 0;
    if (r.transferSize === 0 && r.decodedBodySize > 0) cached++;
  }

  const cacheRate = Math.round((cached / resources.length) * 100);

  renderResourceBreakdown(typeMap, sizeMap, resources.length, cacheRate);
  renderSlowestRequests(resources);
}
```

#### 2b. Resource Breakdown bars
```javascript
function renderResourceBreakdown(typeMap, sizeMap, totalReqs, cacheRate) {
  const totalSize = Object.values(sizeMap).reduce((a, b) => a + b, 0);

  for (const [type, size] of Object.entries(sizeMap)) {
    const pct = totalSize > 0 ? Math.round((size / totalSize) * 100) : 0;
    const bar = document.querySelector(`[data-resource-bar="${type}"]`);
    if (bar) {
      bar.querySelector('.bar-fill').style.width = pct + '%';
      bar.querySelector('.bar-val').textContent = formatBytes(size);
    }
  }

  // Update summary row
  document.querySelector('[data-total-size]').textContent = formatBytes(totalSize);
  document.querySelector('[data-total-reqs]').textContent = totalReqs;
  document.querySelector('[data-cache-rate]').textContent = cacheRate + '%';
}

function formatBytes(bytes) {
  if (bytes > 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB';
  if (bytes > 1_000) return Math.round(bytes / 1_000) + ' KB';
  return bytes + ' B';
}
```

#### 2c. Slowest Requests Table
```javascript
function renderSlowestRequests(resources) {
  const sorted = [...resources]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8);

  const tbody = document.querySelector('[data-slow-requests]');
  if (!tbody) return;

  tbody.innerHTML = sorted.map(r => {
    const name = r.name.split('/').pop().split('?')[0] || r.name;
    const type = getResourceType(r);
    const dur  = Math.round(r.duration);
    const color = dur > 1000 ? 'var(--bad)' : dur > 500 ? 'var(--warn)' : 'inherit';
    return `<tr>
      <td title="${r.name}">${name}</td>
      <td><span class="type-pill type-${type.toLowerCase()}">${type}</span></td>
      <td style="text-align:right;color:${color}">${dur}ms</td>
    </tr>`;
  }).join('');
}
```

#### 2d. Request Waterfall
```javascript
function renderWaterfall(resources) {
  const nav = performance.getEntriesByType('navigation')[0];
  const pageEnd = nav ? nav.loadEventEnd : Math.max(...resources.map(r => r.responseEnd));

  const container = document.querySelector('[data-waterfall]');
  if (!container) return;

  // Sort by start time, take top 12 for display
  const sorted = [...resources]
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 12);

  container.innerHTML = sorted.map(r => {
    const name    = r.name.split('/').pop().split('?')[0] || '(resource)';
    const leftPct = ((r.startTime / pageEnd) * 100).toFixed(1);
    const widthPct = Math.max(((r.duration / pageEnd) * 100).toFixed(1), 0.5);
    const type    = getResourceType(r);
    const colorMap = { JS:'rgba(255,190,11,0.3)', CSS:'rgba(0,229,255,0.25)',
                       Image:'rgba(127,255,110,0.2)', Font:'rgba(192,132,252,0.25)',
                       API:'rgba(255,107,107,0.3)', Other:'rgba(100,100,100,0.2)' };
    const color = colorMap[type] || colorMap.Other;

    return `
      <div class="wf-row">
        <div class="wf-name" title="${r.name}">${name}</div>
        <div class="wf-track">
          <div class="wf-bar" style="left:${leftPct}%;width:${widthPct}%;background:${color}">
            ${Math.round(r.duration)}ms
          </div>
        </div>
      </div>`;
  }).join('');

  // Render time axis labels
  const axis = document.querySelector('[data-waterfall-axis]');
  if (axis) {
    const steps = 5;
    axis.innerHTML = Array.from({ length: steps + 1 }, (_, i) =>
      `<span>${Math.round((pageEnd / steps) * i)}ms</span>`
    ).join('');
  }
}
```

---

## Tier 3 — Business Impact Correlations

### What to implement

1. **Performance × Bounce Rate** — segment users by load speed bucket; track if they bounced
2. **Performance × Conversion** — track goal completions (clicks, form submits, purchases) by load speed segment
3. **Performance by Device** — mobile vs desktop vs tablet load time averages
4. **Performance by Geography** — P75 LCP by region (requires IP geolocation or user-agent hints)
5. **Conversion Impact Table** — show estimated revenue/conversion delta if load time improved

### How to implement

#### 3a. Session data model
Store one record per page view in `localStorage` (keyed by session ID), then POST to a `/api/perf` endpoint for cross-session aggregation. The `ts` and `url` fields are **required** — they are what the global Time Range and Page Selector filters operate on.

```javascript
const sessionPerf = {
  ts: Date.now(),              // REQUIRED — used by time range filter
  url: location.pathname,      // REQUIRED — used by page selector filter
  lcp: null, fcp: null, ttfb: null, cls: null, inp: null,
  loadTime: null,
  deviceType: getDeviceType(),       // 'mobile' | 'tablet' | 'desktop'
  connection: getConnectionType(),   // '4g' | '3g' | 'slow-2g' | 'wifi'
  region: null,                      // set async via getRegion()
  bounced: true,                     // flip to false on meaningful interaction
  converted: false,
};

function getDeviceType() {
  const w = window.innerWidth;
  return w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
}

function getConnectionType() {
  return navigator?.connection?.effectiveType || 'unknown';
}

// Mark as not bounced on meaningful interaction
['click', 'scroll', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => { sessionPerf.bounced = false; }, { once: true });
});

// Mark conversion on a specific action (customize per site)
document.querySelector('[data-conversion-goal]')?.addEventListener('click', () => {
  sessionPerf.converted = true;
});

// Flush on page unload
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    sessionPerf.loadTime = performance.now();
    navigator.sendBeacon('/api/perf', JSON.stringify(sessionPerf));
    // Also persist locally for the dashboard's own filter/aggregation
    persistSession(sessionPerf);
  }
});

// Local persistence — stores up to 500 sessions in localStorage
function persistSession(record) {
  const KEY = 'perf_sessions';
  let all = [];
  try { all = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  all.push(record);
  if (all.length > 500) all = all.slice(-500); // rolling window cap
  localStorage.setItem(KEY, JSON.stringify(all));
}

function loadAllSessions() {
  try { return JSON.parse(localStorage.getItem('perf_sessions') || '[]'); } catch { return []; }
}
```

#### 3b. Device segmentation display
```javascript
function renderDeviceSegment(sessions) {
  const groups = { mobile: [], tablet: [], desktop: [] };
  for (const s of sessions) {
    if (groups[s.deviceType]) groups[s.deviceType].push(s.loadTime);
  }

  for (const [device, times] of Object.entries(groups)) {
    const avg = times.length
      ? (times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1)
      : '—';
    const el = document.querySelector(`[data-device="${device}"]`);
    if (el) el.querySelector('.avg-load').textContent = avg + 's avg';
  }
}
```

#### 3c. Conversion by speed segment
```javascript
function renderConversionBySpeed(sessions) {
  const buckets = {
    fast:   { label: 'Fast (<1s)',    sessions: [], threshold: 1000 },
    medium: { label: 'Medium (1–3s)', sessions: [], threshold: 3000 },
    slow:   { label: 'Slow (>3s)',    sessions: [], threshold: Infinity },
  };

  for (const s of sessions) {
    if (s.loadTime < 1000) buckets.fast.sessions.push(s);
    else if (s.loadTime < 3000) buckets.medium.sessions.push(s);
    else buckets.slow.sessions.push(s);
  }

  const tbody = document.querySelector('[data-conversion-table]');
  if (!tbody) return;

  tbody.innerHTML = Object.values(buckets).map(b => {
    const count = b.sessions.length;
    const conversions = b.sessions.filter(s => s.converted).length;
    const rate = count > 0 ? ((conversions / count) * 100).toFixed(1) : '0.0';
    return `<tr>
      <td>${b.label}</td>
      <td>${count}</td>
      <td>${rate}%</td>
      <td>${conversions}</td>
    </tr>`;
  }).join('');
}
```

#### 3d. Geography — two approaches

**Option A: `navigator.language` + timezone heuristic (no API key)**
```javascript
function getRegionHeuristic() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz.startsWith('America/')) return tz.includes('Los_Angeles') || tz.includes('Denver') ? 'US West' : 'US East';
  if (tz.startsWith('Europe/')) return 'Europe';
  if (tz.startsWith('Asia/')) return 'Asia';
  return 'Other';
}
```

**Option B: IP geolocation via free API (accurate, requires fetch)**
```javascript
async function getRegion() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    return data.continent_code; // 'NA', 'EU', 'AS', etc.
  } catch { return 'unknown'; }
}
```

---

## HTML Structure Reference

The `performance.html` file should contain these key data-attribute hooks so the JS can target them without tight coupling to CSS class names:

```html
<!-- Global controls (in <header>) -->
<div class="time-filter">
  <button data-days="1" class="active">1D</button>
  <button data-days="7">7D</button>
  <button data-days="30">30D</button>
</div>
<select data-page-select>
  <option value="all">All Pages</option>
  <!-- Populated dynamically -->
</select>
<span data-filter-label>All Pages · Last 24 hours</span>

<!-- Tier 1: Core Web Vitals -->
<div data-vital="LCP">
  <span class="vital-value"></span>
  <span class="vital-status"></span>
</div>
<!-- Repeat for INP, CLS, FCP, TTFB -->

<!-- Tier 2: Resource breakdown -->
<div data-resource-bar="JS"> ... </div>
<!-- Repeat for CSS, Image, Font, API, Other -->
<span data-total-size></span>
<span data-total-reqs></span>
<span data-cache-rate></span>

<!-- Tier 2: Slowest requests -->
<tbody data-slow-requests></tbody>

<!-- Tier 2: Waterfall -->
<div data-waterfall-axis></div>
<div data-waterfall></div>

<!-- Tier 3: Device segmentation -->
<div data-device="mobile"> ... </div>
<div data-device="tablet"> ... </div>
<div data-device="desktop"> ... </div>

<!-- Tier 3: Conversion table -->
<tbody data-conversion-table></tbody>
```

---

## Implementation Order (recommended for sub-agent)

1. Add the HTML skeleton with all `data-*` attribute hooks to `performance.html`
2. **Implement global filter state** (`filters` object, `getFilteredSessions()`, `refreshAllSections()`)
3. **Wire time range toggle** — button clicks update `filters.days` and call `refreshAllSections()`
4. **Wire page selector** — `change` event updates `filters.page` and calls `refreshAllSections()`; `populatePageSelector()` runs after sessions are first loaded
5. Implement `renderVital()` + all 5 PerformanceObserver observers for live current-page readings (Tier 1)
6. Implement `renderVitalsFromSessions()` with P75 aggregation for filtered historical view (Tier 1 multi-session)
7. Implement `processResources()` and wire up resource breakdown bars (Tier 2a/b)
8. Implement `renderSlowestRequestsFromSessions()` (Tier 2c)
9. Implement `renderWaterfallFromSessions()` (Tier 2d)
10. Add `sessionPerf` session model, `persistSession()`, `loadAllSessions()`, and `sendBeacon` flush (Tier 3 foundation)
11. Call `populatePageSelector(loadAllSessions())` on page init so the dropdown is pre-populated
12. Implement device segmentation display (Tier 3b)
13. Implement conversion-by-speed table (Tier 3c)
14. Add geography heuristic (Tier 3d Option A first, upgrade to Option B if needed)
15. Call `refreshAllSections()` on page init to render the default state (1D, All Pages)

---

## Browser API Compatibility Notes

| API | Chrome | Firefox | Safari | Edge |
|---|---|---|---|---|
| LCP Observer | 77+ | ✗ | 16.4+ | 79+ |
| INP / event-timing | 96+ | ✗ | ✗ | 96+ |
| CLS Observer | 77+ | ✗ | ✗ | 79+ |
| Resource Timing | All | All | All | All |
| Navigation Timing v2 | 57+ | 58+ | 15+ | 79+ |
| sendBeacon | All | All | All | All |

**Fallback strategy:** Wrap each observer in a `try/catch`. If unsupported, display "N/A" in the card rather than crashing. INP specifically should fall back to FID (First Input Delay) on non-Chromium browsers.

---

## Key Files / Dependencies

| Item | Source |
|---|---|
| web-vitals library (optional) | `https://unpkg.com/web-vitals@4/dist/web-vitals.attribution.js` |
| IP geolocation (optional) | `https://ipapi.co/json/` (1,000 req/day free) |
| All other APIs | Native browser — no install needed |
| Backend beacon endpoint | `/api/perf` — POST, accepts JSON body |