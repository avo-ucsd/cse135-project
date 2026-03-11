/**
 * analytics.js — Team Ate Reporting Dashboard
 *
 * Fetches live data from api.php (same-origin, no CORS needed) and
 * renders KPI cards, the traffic chart, and the top-pages table.
 *
 * Loaded as <script type="module"> by index.html.
 * Chart.js must already be loaded via CDN before this module runs.
 */

'use strict';

const BASE = '/api';

// ── API helper ────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
  const ct = res.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) {
    throw new Error(`Unexpected Content-Type "${ct}" for ${path}`);
  }
  return res.json();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Escape a string for safe insertion into innerHTML. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a duration in milliseconds as "Xm Ys". */
function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

/** Extract the pathname from a full URL string; fall back to the raw string. */
function pathname(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

// ── KPI rendering ─────────────────────────────────────────────────────────────

/**
 * Writes the four KPI values into the dashboard cards.
 * Requires <article data-kpi="pageviews|visitors|bounce|session"> in index.html.
 *
 * @param {{ total: number, data: object[] }} pageviews
 * @param {{ data: object[] }} sessions
 */
function renderKPIs(pageviews, sessions) {
  const sessionData = sessions.data ?? [];

  // Page Views — total from the envelope
  const pvEl = document.querySelector('[data-kpi="pageviews"] .kpi-value');
  if (pvEl) pvEl.textContent = Number(pageviews.total).toLocaleString();

  // Unique Visitors — one row per distinct session_id returned by /api/sessions
  const uvEl = document.querySelector('[data-kpi="visitors"] .kpi-value');
  if (uvEl) uvEl.textContent = sessionData.length.toLocaleString();

  // Bounce Rate — sessions with exactly 1 pageview / total sessions
  if (sessionData.length > 0) {
    const bounceCount = sessionData.filter(s => Number(s.pageview_count) === 1).length;
    const pct = ((bounceCount / sessionData.length) * 100).toFixed(1);
    const brEl = document.querySelector('[data-kpi="bounce"] .kpi-value');
    if (brEl) brEl.textContent = `${pct}%`;
  }

  // Avg. Session Duration — mean of (session_end - session_start)
  const durations = sessionData
    .map(s => {
      const start = new Date(s.session_start);
      const end   = new Date(s.session_end);
      const diff  = end - start;
      return Number.isFinite(diff) && diff >= 0 ? diff : null;
    })
    .filter(d => d !== null);

  if (durations.length > 0) {
    const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgEl = document.querySelector('[data-kpi="session"] .kpi-value');
    if (avgEl) avgEl.textContent = fmtDuration(avgMs);
  }
}

// ── Traffic chart ─────────────────────────────────────────────────────────────

/**
 * Renders the daily-pageview line chart on #trafficChart via Chart.js.
 * Buckets received_at timestamps over the last 30 days.
 *
 * @param {{ data: object[] }} pageviews
 */
function renderTrafficChart(pageviews) {
  const canvas = document.getElementById('trafficChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const rows = pageviews.data ?? [];

  // Build a 30-day window of YYYY-MM-DD keys, all initialised to 0
  const buckets = {};
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }

  for (const row of rows) {
    const ts = row.received_at ?? row.client_timestamp ?? '';
    const day = String(ts).slice(0, 10);
    if (Object.prototype.hasOwnProperty.call(buckets, day)) {
      buckets[day]++;
    }
  }

  const labels = Object.keys(buckets);
  const values = Object.values(buckets);

  // Custom tooltip — Chart.js's built-in 'index' mode can mis-map cursor
  // position to the wrong label when chart padding shifts tick pixels.
  // Using chart.scales.x.getPixelForValue(i) ties lookup to the same
  // coordinate system Chart.js uses when drawing, eliminating the offset.
  const tooltip = document.getElementById('tooltip');

  // Tracks the snapped x-pixel of the hovered point for the crosshair plugin.
  let crosshairX = null;

  // Draws a thin dashed vertical line through the hovered data point.
  const crosshairPlugin = {
    id: 'crosshair',
    afterDraw(ch) {
      if (crosshairX === null) return;
      const { ctx, chartArea: { top, bottom } } = ch;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(crosshairX, top);
      ctx.lineTo(crosshairX, bottom);
      ctx.lineWidth   = 1;
      ctx.strokeStyle = 'rgba(185,79,247,0.55)';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    },
  };

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Page Views',
        data: values,
        borderColor: '#b94ff7',
        backgroundColor: 'rgba(185,79,247,0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend:   { display: false },
        tooltip:  { enabled: false }, // replaced by custom tooltip below
        crosshair: {},
      },
      scales: {
        x: {
          ticks: { color: '#717a96', maxTicksLimit: 8 },
          grid:  { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#717a96', precision: 0 },
          grid:  { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
    plugins: [crosshairPlugin],
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // Work entirely in CSS pixels — getPixelForValue() returns CSS pixels,
    // so mouseX must also be in CSS pixels (no canvas-DPI scaling).
    const mouseX = e.clientX - rect.left;

    // Find the data index whose rendered x-pixel is closest to the cursor
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    let nearestIndex = -1;
    let nearestDist  = Infinity;

    for (let i = 0; i < labels.length; i++) {
      const dist = Math.abs(mouseX - xScale.getPixelForValue(i));
      if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
    }

    if (nearestIndex >= 0 && nearestDist < 30) {
      const px = xScale.getPixelForValue(nearestIndex);
      const py = yScale.getPixelForValue(values[nearestIndex]);

      crosshairX = px;
      chart.draw();

      tooltip.style.display = 'block';
      tooltip.style.left    = `${rect.left + px + 14}px`;
      tooltip.style.top     = `${rect.top  + py - 48}px`;
      tooltip.innerHTML     =
        `<strong>${escHtml(labels[nearestIndex])}</strong><br>` +
        `${values[nearestIndex].toLocaleString()} pageviews`;
    } else {
      crosshairX = null;
      chart.draw();
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    crosshairX = null;
    chart.draw();
    tooltip.style.display = 'none';
  });

  // Update figcaption with real date range
  const caption = canvas.closest('figure')?.querySelector('figcaption');
  if (caption && labels.length >= 2) {
    caption.textContent = `Daily page views, ${labels[0]} – ${labels[labels.length - 1]}`;
  }
}

// ── Top Pages table ───────────────────────────────────────────────────────────

/**
 * Groups pageview rows by URL and replaces the hardcoded <tbody> with live data.
 * Shows top 10 pages by view count.
 *
 * @param {{ data: object[] }} pageviews
 */
function renderTopPages(pageviews) {
  const tbody = document.querySelector('.table-section tbody');
  if (!tbody) return;

  const rows = pageviews.data ?? [];

  // Aggregate per URL
  /** @type {Map<string, { views: number, sessions: Set<string>, totalDuration: number, durationCount: number }>} */
  const urlMap = new Map();

  for (const row of rows) {
    const url = row.url ?? '(unknown)';
    if (!urlMap.has(url)) {
      urlMap.set(url, { views: 0, sessions: new Set(), totalDuration: 0, durationCount: 0, errors: 0 });
    }
    const entry = urlMap.get(url);
    entry.views++;
    if (row.session_id) entry.sessions.add(row.session_id);
    entry.errors += Number(row.error_count ?? 0);
    if (row.page_entered_at && row.page_left_at) {
      const dur = new Date(row.page_left_at) - new Date(row.page_entered_at);
      if (Number.isFinite(dur) && dur >= 0) {
        entry.totalDuration += dur;
        entry.durationCount++;
      }
    }
  }

  const top10 = [...urlMap.entries()]
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 10);

  tbody.innerHTML = top10.map(([url, s], i) => {
    const avgMs   = s.durationCount > 0 ? s.totalDuration / s.durationCount : 0;
    const path    = pathname(url);
    const errCell = s.errors > 0
      ? `<td class="error-val">${s.errors.toLocaleString()}</td>`
      : `<td>—</td>`;
    return `
      <tr>
        <td>${i + 1}</td>
        <td><a href="${escHtml(url)}">${escHtml(path)}</a></td>
        <td>${s.views.toLocaleString()}</td>
        <td>${s.sessions.size.toLocaleString()}</td>
        <td>${fmtDuration(avgMs)}</td>
        ${errCell}
      </tr>`;
  }).join('');
}

// ── Error banner ──────────────────────────────────────────────────────────────

function showError(msg) {
  const banner = document.createElement('p');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'background:#f87171;color:#0f1117;padding:0.75rem 1.25rem;border-radius:8px;margin:1rem;font-weight:600';
  banner.textContent = `Analytics failed to load: ${msg}`;
  document.querySelector('main')?.prepend(banner);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [pageviews, sessions] = await Promise.all([
      apiFetch('/pageviews?limit=1000'),
      apiFetch('/sessions'),
    ]);
    renderKPIs(pageviews, sessions);
    renderTrafficChart(pageviews);
    renderTopPages(pageviews);
  } catch (err) {
    console.error('[analytics]', err);
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
