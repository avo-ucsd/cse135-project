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
 * Renders the daily-pageview line chart on #trafficChart via raw Canvas 2D API.
 * Buckets received_at timestamps over the last 30 days.
 *
 * @param {{ data: object[] }} pageviews
 */
function renderTrafficChart(pageviews) {
  const canvas = document.getElementById('trafficChart');
  if (!canvas) return;

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

  // Convert to {date, value} array (noon UTC avoids timezone date-shift)
  const data = Object.entries(buckets).map(([key, count]) => ({
    date: new Date(key + 'T12:00:00'),
    value: count,
  }));

  const ctx = canvas.getContext('2d');
  const tooltip = document.getElementById('tooltip');

  const margin = { top: 40, right: 25, bottom: 55, left: 60 };
  const chartWidth  = canvas.width  - margin.left - margin.right;
  const chartHeight = canvas.height - margin.top  - margin.bottom;

  // --- Scale Function ---
  function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
    const fn = function(value) {
      if (domainMax === domainMin) return rangeMin;
      const fraction = (value - domainMin) / (domainMax - domainMin);
      return rangeMin + fraction * (rangeMax - rangeMin);
    };
    fn.domainMin = domainMin;
    fn.domainMax = domainMax;
    fn.rangeMin = rangeMin;
    fn.rangeMax = rangeMax;
    return fn;
  }

  // Compute scales
  const values = data.map(d => d.value);
  const yMin = Math.floor(Math.min(...values) / 50) * 50;
  const yMax = Math.ceil(Math.max(...values) / 50) * 50;
  const yMaxSafe = yMax === yMin ? yMin + 50 : yMax;

  const xScale = linearScale(0, data.length - 1, margin.left, margin.left + chartWidth);
  const yScale = linearScale(yMin, yMaxSafe, margin.top + chartHeight, margin.top);

  // --- Drawing Functions ---
  function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGridLines();
    drawXAxisLabels();
    drawFilledArea();
    drawLine();
    drawDataPoints();
    drawTitle();
  }

  function drawGridLines() {
    const tickCount = 6;
    const step = (yMaxSafe - yMin) / tickCount;

    for (let i = 0; i <= tickCount; i++) {
      const value = yMin + step * i;
      const y = yScale(value);

      // Grid line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 3;
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + chartWidth, y);
      ctx.stroke();

      // Y-axis label
      ctx.fillStyle = '#717a96';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(value).toLocaleString(), margin.left - 10, y);
    }

    // Y-axis line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + chartHeight);
    ctx.stroke();

    // X-axis line
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartHeight);
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
    ctx.stroke();
  }

  function drawXAxisLabels() {
    ctx.fillStyle = '#717a96';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    data.forEach((point, i) => {
      if (i % 5 === 0 || i === data.length - 1) {
        const x = xScale(i);
        const y = margin.top + chartHeight;

        // Tick mark
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 6);
        ctx.stroke();

        // Date label
        const dateStr = point.date.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric'
        });
        ctx.fillText(dateStr, x, y + 10);
      }
    });
  }

  function drawFilledArea() {
    ctx.beginPath();
    data.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.value);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Close the area down to the x-axis
    ctx.lineTo(xScale(data.length - 1), margin.top + chartHeight);
    ctx.lineTo(xScale(0), margin.top + chartHeight);
    ctx.closePath();

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
    gradient.addColorStop(0, 'rgba(80, 36, 146, 0.26)');
    gradient.addColorStop(1, 'rgba(61, 19, 70, 0.02)');
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function drawLine() {
    ctx.beginPath();
    ctx.strokeStyle = '#b94ff7';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    data.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.value);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  }

  function drawDataPoints() {
    data.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.value);

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#b94ff7';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  function drawTitle() {
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Daily Pageviews \u2014 Last 30 Days', canvas.width / 2, 10);
  }

  // Highlight a specific point (for hover)
  function highlightPoint(index) {
    const x = xScale(index);
    const y = yScale(data[index].value);

    // Vertical guide line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(80, 36, 146, 0.26)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Highlighted point
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = '#b94ff7';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#b94ff7';
    ctx.fill();
  }

  // --- Tooltip Interaction ---
  canvas.addEventListener('mousemove', function(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;

    // Find nearest data point
    let nearestIndex = -1;
    let nearestDist = Infinity;

    data.forEach((point, i) => {
      const px = xScale(i);
      const dist = Math.abs(mouseX - px);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    });

    if (nearestIndex >= 0 && nearestDist < 25 * scaleX) {
      const point = data[nearestIndex];
      const px = xScale(nearestIndex) / scaleX;
      const py = yScale(point.value) / scaleX;

      // Redraw chart with highlight
      drawChart();
      highlightPoint(nearestIndex);

      // Position tooltip
      const dateStr = point.date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
      tooltip.innerHTML = '<strong>' + escHtml(dateStr) + '</strong><br>' +
        point.value.toLocaleString() + ' pageviews';
      tooltip.style.display = 'block';

      // Position relative to chart container
      let tooltipLeft = px + 15;
      let tooltipTop  = py - 60;

      // Keep tooltip in bounds
      if (tooltipLeft + 180 > rect.width) {
        tooltipLeft = px - 190;
      }
      if (tooltipTop < 0) {
        tooltipTop = py + 15;
      }

      tooltip.style.left = tooltipLeft + 'px';
      tooltip.style.top  = tooltipTop + 'px';
    } else {
      tooltip.style.display = 'none';
      drawChart();
    }
  });

  canvas.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
    drawChart();
  });

  // Update figcaption with real date range
  const keys = Object.keys(buckets);
  const caption = canvas.closest('figure')?.querySelector('figcaption');
  if (caption && keys.length >= 2) {
    caption.textContent = `Daily page views, ${keys[0]} – ${keys[keys.length - 1]}`;
  }

  // Initial draw
  drawChart();
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
