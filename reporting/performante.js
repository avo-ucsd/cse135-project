'use strict';

const BASE = '/api';

// ── API helper ────────────────────────────────────────────────────────────

async function apiFetch(path) {
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
    const ct = res.headers.get('Content-Type') ?? '';
    if (!ct.includes('application/json')) {
    throw new Error(`Unexpected Content-Type "${ct}" for ${path}`);
    }
    return res.json();
}

// ── Utilities ─────────────────────────────────────────────────────────────

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

/** Linear scale mapping a domain to a pixel range. */
function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
    const fn = function(value) {
    if (domainMax === domainMin) return rangeMin;
    const fraction = (value - domainMin) / (domainMax - domainMin);
    return rangeMin + fraction * (rangeMax - rangeMin);
    };
    fn.domainMin = domainMin;
    fn.domainMax = domainMax;
    fn.rangeMin  = rangeMin;
    fn.rangeMax  = rangeMax;
    return fn;
}

/** Build a 30-day YYYY-MM-DD bucket map, each value defaulting to { total: 0, count: 0 }. */
function make30DayBuckets() {
    const b = {};
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    b[d.toISOString().slice(0, 10)] = { total: 0, count: 0 };
    }
    return b;
}

// ── Error banner ──────────────────────────────────────────────────────────

function showError(msg) {
    const banner = document.createElement('p');
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
    'background:#f87171;color:#0f1117;padding:0.75rem 1.25rem;border-radius:8px;margin:1rem;font-weight:600';
    banner.textContent = `Performance data failed to load: ${msg}`;
    document.querySelector('main')?.prepend(banner);
}

// ── Aggregate builder ─────────────────────────────────────────────────────

/**
 * Builds per-URL aggregates and session-ordering data from raw API rows.
 *
 * @param {object[]} rows      - pageview rows from /api/pageviews
 * @param {object[]} sessionData - session rows from /api/sessions
 * @returns {{ urlMap: Map, bounceSessions: Set, sessionMap: Map }}
 */
function buildAggregates(rows, sessionData) {
    // Per-URL map
    const urlMap = new Map();

    for (const row of rows) {
    if (row.event_type === 'error') continue;  // skip pure error beacons
    const url = row.url ?? '(unknown)';
    if (!urlMap.has(url)) {
        urlMap.set(url, {
        url,
        views:          0,
        sessions:       new Set(),
        totalDuration:  0,
        durationCount:  0,
        errors:         0,
        entrances:      0,
        exits:          0,
        dailyDurations: make30DayBuckets(),
        });
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
        const day = String(row.page_entered_at).slice(0, 10);
        if (Object.prototype.hasOwnProperty.call(entry.dailyDurations, day)) {
            entry.dailyDurations[day].total += dur;
            entry.dailyDurations[day].count++;
        }
        }
    }
    }

    // Group rows by session, sort by entered_at, mark entrance/exit URLs
    const sessionMap = new Map();
    for (const row of rows) {
    if (!row.session_id || row.event_type === 'error') continue;
    if (!sessionMap.has(row.session_id)) sessionMap.set(row.session_id, []);
    sessionMap.get(row.session_id).push(row);
    }

    for (const pages of sessionMap.values()) {
    pages.sort((a, b) =>
        new Date(a.page_entered_at ?? a.received_at) -
        new Date(b.page_entered_at ?? b.received_at)
    );
    const firstUrl = pages[0].url;
    const lastUrl  = pages.at(-1).url;
    if (urlMap.has(firstUrl)) urlMap.get(firstUrl).entrances++;
    if (urlMap.has(lastUrl))  urlMap.get(lastUrl).exits++;
    }

    // Bounce sessions: sessions with exactly 1 pageview
    const bounceSessions = new Set(
    sessionData
        .filter(s => Number(s.pageview_count) === 1)
        .map(s => s.session_id)
    );

    return { urlMap, bounceSessions, sessionMap };
}

// ── Chart: Top Pages Bar (horizontal) ────────────────────────────────────

/**
 * Draws a horizontal bar chart of top N pages ranked by views or unique visitors.
 *
 * @param {Map}    urlMap - per-URL aggregate map
 * @param {string} metric - 'views' or 'uniques'
 * @param {number} topN   - number of top pages to show
 */
function drawTopPagesBar(urlMap, metric, topN) {
    const canvas = document.getElementById('topPagesChart');
    if (!canvas) return;

    const getValue = e => metric === 'uniques' ? e.sessions.size : e.views;
    const top = [...urlMap.values()]
    .sort((a, b) => getValue(b) - getValue(a))
    .slice(0, topN);

    const ctx    = canvas.getContext('2d');
    const margin = { top: 40, right: 80, bottom: 40, left: 220 };
    const w      = canvas.width  - margin.left - margin.right;
    const h      = canvas.height - margin.top  - margin.bottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (top.length === 0) {
    ctx.fillStyle = '#717a96';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
    return;
    }

    const maxVal  = Math.max(...top.map(getValue));
    const xScale  = linearScale(0, maxVal || 1, 0, w);
    const barH    = Math.min(32, Math.floor(h / top.length) - 6);
    const totalBH = (barH + 6) * top.length;
    const startY  = margin.top + (h - totalBH) / 2;

    // Title
    const metricLabel = metric === 'uniques' ? 'Unique Visitors' : 'Page Views';
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Top ${topN} Pages — ${metricLabel}`, canvas.width / 2, 10);

    // X-axis grid lines
    const tickCount = 5;
    for (let t = 0; t <= tickCount; t++) {
    const val = (maxVal / tickCount) * t;
    const x   = margin.left + xScale(val);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + h);
    ctx.stroke();
    ctx.fillStyle = '#717a96';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(Math.round(val).toLocaleString(), x, margin.top + h + 18);
    }

    // Y-axis line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + h);
    ctx.stroke();

    // Bars
    top.forEach((entry, i) => {
    const y    = startY + i * (barH + 6);
    const val  = getValue(entry);
    const barW = xScale(val);

    // Gradient fill
    const grad = ctx.createLinearGradient(margin.left, 0, margin.left + barW, 0);
    grad.addColorStop(0, '#b94ff7');
    grad.addColorStop(1, 'rgba(185,79,247,0.4)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect
        ? ctx.roundRect(margin.left, y, barW, barH, 3)
        : ctx.rect(margin.left, y, barW, barH);
    ctx.fill();

    // Page label (right-aligned, truncated)
    const label = pathname(entry.url);
    ctx.fillStyle = '#e8eaf0';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.length > 30 ? label.slice(0, 28) + '…' : label,
                    margin.left - 8, y + barH / 2);

    // Value label
    ctx.fillStyle = '#717a96';
    ctx.textAlign = 'left';
    ctx.fillText(val.toLocaleString(), margin.left + barW + 6, y + barH / 2);
    });

    // Update figcaption
    const caption = document.getElementById('bar-caption');
    if (caption) caption.textContent = `Top ${topN} pages by ${metricLabel.toLowerCase()}`;
}

// ── Chart: Time-on-Page Trend (line) ─────────────────────────────────────

/** AbortController for trend chart mouse listeners — replaced on each redraw. */
let trendAbort = null;

/** AbortController for entry/exit bar chart mouse listeners — replaced on each redraw. */
let entryExitAbort = null;

/**
 * Draws a line chart of average daily time on page over the last 30 days.
 *
 * @param {Map}    urlMap      - per-URL aggregate map
 * @param {string} selectedUrl - '' means aggregate all pages
 */
function drawTrendLine(urlMap, selectedUrl) {
    const canvas  = document.getElementById('trendChart');
    const tooltip = document.getElementById('trend-tooltip');
    if (!canvas) return;

    // Cancel previous mouse listeners before re-registering
    if (trendAbort) trendAbort.abort();
    trendAbort = new AbortController();

    // Aggregate 30-day buckets
    const buckets = make30DayBuckets();

    const entries = selectedUrl
    ? (urlMap.has(selectedUrl) ? [urlMap.get(selectedUrl)] : [])
    : [...urlMap.values()];

    for (const entry of entries) {
    for (const [day, b] of Object.entries(entry.dailyDurations)) {
        if (Object.prototype.hasOwnProperty.call(buckets, day)) {
        buckets[day].total += b.total;
        buckets[day].count += b.count;
        }
    }
    }

    // Convert to {date, value} where value = avg seconds (0 if no data)
    const data = Object.entries(buckets).map(([key, b]) => ({
    date:  new Date(key + 'T12:00:00'),
    value: b.count > 0 ? b.total / b.count / 1000 : 0,  // ms → s
    key,
    }));

    const ctx    = canvas.getContext('2d');
    const margin = { top: 40, right: 25, bottom: 55, left: 70 };
    const cW     = canvas.width  - margin.left - margin.right;
    const cH     = canvas.height - margin.top  - margin.bottom;

    const vals    = data.map(d => d.value);
    const yMin    = 0;
    const yMaxRaw = Math.ceil(Math.max(...vals, 10) / 10) * 10;
    const yMax    = yMaxRaw === yMin ? yMin + 60 : yMaxRaw;

    const xScale = linearScale(0, data.length - 1, margin.left, margin.left + cW);
    const yScale = linearScale(yMin, yMax, margin.top + cH, margin.top);

    // ── Draw helpers (accept ctx explicitly — no stale closure) ────────

    function drawChart(c) {
    c.clearRect(0, 0, canvas.width, canvas.height);

    const pageLabel = selectedUrl ? pathname(selectedUrl) : 'All Pages';
    c.fillStyle = '#e8eaf0';
    c.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText(`Avg. Time on Page — ${pageLabel}`, canvas.width / 2, 10);

    // Grid lines + Y labels
    const tickCount = 6;
    const step = (yMax - yMin) / tickCount;
    for (let i = 0; i <= tickCount; i++) {
        const val = yMin + step * i;
        const y   = yScale(val);
        c.beginPath();
        c.strokeStyle = 'rgba(255,255,255,0.07)';
        c.lineWidth = 1;
        c.moveTo(margin.left, y);
        c.lineTo(margin.left + cW, y);
        c.stroke();
        c.fillStyle = '#717a96';
        c.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        const label = val >= 60 ? `${Math.floor(val/60)}m ${Math.round(val%60)}s` : `${Math.round(val)}s`;
        c.fillText(label, margin.left - 8, y);
    }

    // Axes
    c.beginPath();
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 2;
    c.moveTo(margin.left, margin.top);
    c.lineTo(margin.left, margin.top + cH);
    c.lineTo(margin.left + cW, margin.top + cH);
    c.stroke();

    // X-axis labels
    c.fillStyle = '#717a96';
    c.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    data.forEach((pt, i) => {
        if (i % 5 === 0 || i === data.length - 1) {
        const x = xScale(i);
        const y = margin.top + cH;
        c.beginPath();
        c.strokeStyle = 'rgb(249,249,249)';
        c.lineWidth = 2;
        c.moveTo(x, y);
        c.lineTo(x, y + 6);
        c.stroke();
        c.fillText(pt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, y + 10);
        }
    });

    // Filled area
    c.beginPath();
    data.forEach((pt, i) => {
        const x = xScale(i);
        const y = yScale(pt.value);
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    });
    c.lineTo(xScale(data.length - 1), margin.top + cH);
    c.lineTo(xScale(0), margin.top + cH);
    c.closePath();
    const grad = c.createLinearGradient(0, margin.top, 0, margin.top + cH);
    grad.addColorStop(0, 'rgba(80,36,146,0.26)');
    grad.addColorStop(1, 'rgba(61,19,70,0.02)');
    c.fillStyle = grad;
    c.fill();

    // Line
    c.beginPath();
    c.strokeStyle = '#b94ff7';
    c.lineWidth = 2.5;
    c.lineJoin = 'round';
    c.lineCap  = 'round';
    data.forEach((pt, i) => {
        const x = xScale(i);
        const y = yScale(pt.value);
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    });
    c.stroke();

    // Data points
    data.forEach((pt, i) => {
        const x = xScale(i);
        const y = yScale(pt.value);
        c.beginPath();
        c.arc(x, y, 3, 0, Math.PI * 2);
        c.fillStyle   = '#b94ff7';
        c.fill();
        c.strokeStyle = 'white';
        c.lineWidth   = 1.5;
        c.stroke();
    });
    }

    function highlightPoint(c, index) {
    const x = xScale(index);
    const y = yScale(data[index].value);
    c.beginPath();
    c.strokeStyle = 'rgb(161,113,232)';
    c.lineWidth = 2;
    c.setLineDash([4, 4]);
    c.moveTo(x, margin.top);
    c.lineTo(x, margin.top + cH);
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.arc(x, y, 6, 0, Math.PI * 2);
    c.fillStyle   = 'white';
    c.fill();
    c.strokeStyle = '#b94ff7';
    c.lineWidth   = 2.5;
    c.stroke();
    c.beginPath();
    c.arc(x, y, 3, 0, Math.PI * 2);
    c.fillStyle = '#b94ff7';
    c.fill();
    }

    // ── Tooltip interaction ───────────────────────────────────────────

    canvas.addEventListener('mousemove', function(e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;

    let nearestIndex = -1;
    let nearestDist  = Infinity;
    data.forEach((pt, i) => {
        const dist = Math.abs(mouseX - xScale(i));
        if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
    });

    if (nearestIndex >= 0 && nearestDist < 25 * scaleX) {
        const pt  = data[nearestIndex];
        const px  = xScale(nearestIndex) / scaleX;
        const py  = yScale(pt.value) / scaleX;
        drawChart(ctx);
        highlightPoint(ctx, nearestIndex);

        const dateStr = pt.date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        });
        tooltip.innerHTML = `<strong>${escHtml(dateStr)}</strong><br>Avg: ${escHtml(fmtDuration(pt.value * 1000))}`;
        tooltip.style.display = 'block';

        let tLeft = px + 15;
        let tTop  = py - 60;
        if (tLeft + 180 > rect.width) tLeft = px - 190;
        if (tTop < 0) tTop = py + 15;
        tooltip.style.left = tLeft + 'px';
        tooltip.style.top  = tTop + 'px';
    } else {
        tooltip.style.display = 'none';
        drawChart(ctx);
    }
    }, { signal: trendAbort.signal });

    canvas.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
    drawChart(ctx);
    }, { signal: trendAbort.signal });

    // Initial draw
    drawChart(ctx);

    // Update figcaption
    const caption = document.getElementById('trend-caption');
    if (caption) {
    const keys = Object.keys(make30DayBuckets());
    caption.textContent =
        `Average time on page per day, ${keys[0]} – ${keys[keys.length - 1]}`;
    }
}

// ── Chart: Entry vs Exit Stacked Bar ──────────────────────────────────────

/**
 * Draws a stacked vertical bar chart: entry rate (purple) + exit rate (red) per page.
 *
 * @param {Map} urlMap     - per-URL aggregate map
 * @param {Map} sessionMap - session_id → sorted Row[]
 */
function drawEntryExitBar(urlMap, sessionMap) {
    const canvas = document.getElementById('entryExitChart');
    if (!canvas) return;

    // Top 10 pages by entrances
    const top = [...urlMap.values()]
    .filter(e => e.views > 0)
    .sort((a, b) => b.entrances - a.entrances)
    .slice(0, 10);

    const ctx    = canvas.getContext('2d');
    const margin = { top: 60, right: 25, bottom: 90, left: 55 };
    const cW     = canvas.width  - margin.left - margin.right;
    const cH     = canvas.height - margin.top  - margin.bottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (top.length === 0) {
    ctx.fillStyle = '#717a96';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No session data available', canvas.width / 2, canvas.height / 2);
    return;
    }

    const barW  = Math.floor(cW / top.length) - 10;
    const yScale = linearScale(0, 100, margin.top + cH, margin.top);

    if (entryExitAbort) entryExitAbort.abort();
    entryExitAbort = new AbortController();

    // Grid lines + Y labels (0–100%)
    for (let pct = 0; pct <= 100; pct += 20) {
    const y = yScale(pct);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + cW, y);
    ctx.stroke();
    ctx.fillStyle = '#717a96';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, margin.left - 8, y);
    }

    // Axes
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + cH);
    ctx.lineTo(margin.left + cW, margin.top + cH);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Entry vs Exit Rate — Top Landing Pages', canvas.width / 2, 10);

    // Legend
    const legendX = canvas.width - 160;
    const legendY = 32;
    ctx.fillStyle = '#b94ff7';
    ctx.fillRect(legendX, legendY, 12, 12);
    ctx.fillStyle = '#e8eaf0';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Entry rate', legendX + 16, legendY + 6);

    ctx.fillStyle = '#f87171';
    ctx.fillRect(legendX + 90, legendY, 12, 12);
    ctx.fillStyle = '#e8eaf0';
    ctx.fillText('Exit rate', legendX + 106, legendY + 6);

    // Bars
    top.forEach((entry, i) => {
    const x             = margin.left + i * (barW + 10) + 5;
    const entryRate     = entry.views > 0 ? (entry.entrances / entry.views) * 100 : 0;
    const exitRate      = entry.views > 0 ? (entry.exits     / entry.views) * 100 : 0;
    // Clamp display values so the stacked bar never overflows the chart boundary
    const entryRateDisp = Math.min(entryRate, 100);
    const exitRateDisp  = Math.min(exitRate, Math.max(0, 100 - entryRateDisp));
    const baseline      = margin.top + cH;
    const entryH        = baseline - yScale(entryRateDisp);
    const exitH         = baseline - yScale(exitRateDisp);

    // Entry segment (bottom, purple)
    ctx.fillStyle = '#b94ff7';
    ctx.fillRect(x, baseline - entryH, barW, entryH);

    // Exit segment (on top of entry, red)
    ctx.fillStyle = '#f87171';
    ctx.fillRect(x, baseline - entryH - exitH, barW, exitH);

    // X-axis label (rotated)
    const label = pathname(entry.url);
    const short = label.length > 20 ? label.slice(0, 18) + '…' : label;
    ctx.save();
    ctx.translate(x + barW / 2, baseline + 8);
    ctx.rotate(-35 * Math.PI / 180);
    ctx.fillStyle = '#717a96';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(short, 0, 0);
    ctx.restore();
    });

    const tooltipEl = document.getElementById('entryexit-tooltip');

    canvas.addEventListener('mousemove', e => {
        if (!tooltipEl) return;
        const rect   = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const scaleY = canvas.height / rect.height;
        const mx     = (e.clientX - rect.left) * scaleX;

        let hi = -1;
        top.forEach((_, i) => {
            const barLeft  = margin.left + i * (barW + 10) + 5;
            const barRight = barLeft + barW;
            if (mx >= barLeft && mx <= barRight) hi = i;
        });

        if (hi >= 0) {
            const entry      = top[hi];
            const entryRate  = entry.views > 0 ? (entry.entrances / entry.views) * 100 : 0;
            const exitRate   = entry.views > 0 ? (entry.exits     / entry.views) * 100 : 0;
            const barCenterX = (margin.left + hi * (barW + 10) + 5 + barW / 2) / scaleX;
            const topBarY    = yScale(Math.min(entryRate + exitRate, 100)) / scaleY;

            tooltipEl.innerHTML =
                `<strong>${escHtml(pathname(entry.url))}</strong><br>` +
                `Views: ${entry.views.toLocaleString()}<br>` +
                `Entry rate: ${entryRate.toFixed(1)}%<br>` +
                `Exit rate: ${exitRate.toFixed(1)}%`;
            tooltipEl.style.display = 'block';

            const TOOLTIP_W = 170;
            let tLeft = barCenterX - TOOLTIP_W / 2;
            let tTop  = topBarY - 90;
            if (tLeft < 0)                      tLeft = 0;
            if (tLeft + TOOLTIP_W > rect.width) tLeft = rect.width - TOOLTIP_W;
            if (tTop < 0)                       tTop  = topBarY + 10;
            tooltipEl.style.left = `${tLeft}px`;
            tooltipEl.style.top  = `${tTop}px`;
        } else {
            tooltipEl.style.display = 'none';
        }
    }, { signal: entryExitAbort.signal });

    canvas.addEventListener('mouseleave', () => {
        if (tooltipEl) tooltipEl.style.display = 'none';
    }, { signal: entryExitAbort.signal });

}

// ── Table: Top Pages Detail ───────────────────────────────────────────────

/**
 * Renders the top 20 pages by views into #topdetail-tbody.
 *
 * @param {Map}    urlMap          - per-URL aggregate map
 * @param {Set}    bounceSessions   - session_ids with only 1 pageview (unused here, kept for parity)
 * @param {object[]} rows           - raw pageview rows (unused here, kept for parity)
 */
function renderTopDetail(urlMap, bounceSessions, rows) {
    const tbody = document.getElementById('topdetail-tbody');
    const wrap  = document.getElementById('topdetail-wrap');
    const status = document.getElementById('perf-status');
    if (!tbody) return;

    const top20 = [...urlMap.values()]
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);

    if (top20.length === 0) {
    if (status) status.textContent = 'No pageview data available.';
    return;
    }

    tbody.innerHTML = '';
    top20.forEach((entry, i) => {
    const avgMs    = entry.durationCount > 0
        ? entry.totalDuration / entry.durationCount : null;
    const path     = pathname(entry.url);

    const tr = document.createElement('tr');

    // Rank
    const tdRank = document.createElement('td');
    tdRank.textContent = i + 1;
    tdRank.style.color = 'var(--text-muted)';
    tr.appendChild(tdRank);

    // Page (link)
    const tdPage = document.createElement('td');
    tdPage.dataset.col = 'page';
    const a = document.createElement('a');
    a.href        = entry.url;
    a.textContent = path;
    a.title       = entry.url;
    tdPage.appendChild(a);
    tr.appendChild(tdPage);

    // Views
    const tdViews = document.createElement('td');
    tdViews.textContent = entry.views.toLocaleString();
    tr.appendChild(tdViews);

    // Unique
    const tdUniq = document.createElement('td');
    tdUniq.textContent = entry.sessions.size.toLocaleString();
    tr.appendChild(tdUniq);

    // Avg Time
    const tdTime = document.createElement('td');
    if (avgMs === null) {
        tdTime.textContent = '—';
        tdTime.className   = 'null-val';
    } else {
        tdTime.textContent = fmtDuration(avgMs);
    }
    tr.appendChild(tdTime);

    // Entrances
    const tdEnt = document.createElement('td');
    tdEnt.textContent = entry.entrances.toLocaleString();
    tr.appendChild(tdEnt);

    // Exits
    const tdExit = document.createElement('td');
    tdExit.textContent = entry.exits.toLocaleString();
    tr.appendChild(tdExit);

    // Errors
    const tdErr = document.createElement('td');
    if (entry.errors > 0) {
        tdErr.textContent = entry.errors.toLocaleString();
        tdErr.className   = 'error-val';
    } else {
        tdErr.textContent = '—';
        tdErr.className   = 'null-val';
    }
    tr.appendChild(tdErr);

    tbody.appendChild(tr);
    });

    if (status) status.hidden = true;
    if (wrap)   wrap.hidden   = false;
}

// ── Table: Underperforming Pages ──────────────────────────────────────────

/**
 * Determines the suggested action badge text based on page metrics.
 *
 * @param {{ bounceRate: number, avgMs: number|null, errors: number, views: number }} m
 * @returns {string}
 */
function suggestedAction(m) {
    const avgSec = m.avgMs !== null ? m.avgMs / 1000 : Infinity;
    if (m.bounceRate >= 0.70 && avgSec < 10) return 'Improve content relevance';
    if (m.bounceRate >= 0.70)                 return 'Reduce bounce rate';
    if (avgSec < 10 && m.views >= 20)         return 'Increase content depth';
    if (m.errors > 0)                         return 'Fix JS errors';
    if (avgSec < 30)                          return 'Improve engagement';
    return 'Monitor';
}

/**
 * Renders underperforming pages into #underperf-tbody.
 *
 * @param {Map} urlMap
 * @param {Set} bounceSessions
 */
function renderUnderperf(urlMap, bounceSessions) {
    const tbody = document.getElementById('underperf-tbody');
    const wrap  = document.getElementById('underperf-wrap');
    if (!tbody) return;

    const candidates = [];

    for (const entry of urlMap.values()) {
    const totalSessions = entry.sessions.size;
    const avgMs         = entry.durationCount > 0
        ? entry.totalDuration / entry.durationCount : null;
    const avgSec        = avgMs !== null ? avgMs / 1000 : Infinity;

    // Count how many of this page's sessions are bounce sessions
    let bounceCount = 0;
    for (const sid of entry.sessions) {
        if (bounceSessions.has(sid)) bounceCount++;
    }
    const bounceRate = totalSessions > 0 ? bounceCount / totalSessions : 0;

    // Inclusion criteria
    const flagBounce = bounceRate >= 0.50 && totalSessions >= 5;
    const flagTime   = avgSec < 30 && entry.durationCount >= 5;
    const flagErrors = entry.errors > 0;

    if (!flagBounce && !flagTime && !flagErrors) continue;

    candidates.push({ entry, bounceRate, avgMs, avgSec });
    }

    // Sort by bounce rate desc, then avg time asc
    candidates.sort((a, b) =>
    b.bounceRate - a.bounceRate || (a.avgSec - b.avgSec)
    );

    tbody.innerHTML = '';

    if (candidates.length === 0) {
    const tr  = document.createElement('tr');
    const td  = document.createElement('td');
    td.colSpan   = 5;
    td.textContent = 'No underperforming pages detected.';
    td.style.textAlign = 'center';
    td.className = 'null-val';
    tr.appendChild(td);
    tbody.appendChild(tr);
    if (wrap) wrap.hidden = false;
    return;
    }

    candidates.forEach(({ entry, bounceRate, avgMs }) => {
    const path  = pathname(entry.url);
    const pctStr = (bounceRate * 100).toFixed(1) + '%';
    const action = suggestedAction({
        bounceRate, avgMs, errors: entry.errors, views: entry.views,
    });

    const bounceCls = bounceRate >= 0.70 ? 'error-val'
                    : bounceRate >= 0.50 ? 'warn-val' : '';

    const tr = document.createElement('tr');

    // Page
    const tdPage = document.createElement('td');
    tdPage.dataset.col = 'page';
    const a = document.createElement('a');
    a.href        = entry.url;
    a.textContent = path;
    a.title       = entry.url;
    tdPage.appendChild(a);
    tr.appendChild(tdPage);

    // Views
    const tdViews = document.createElement('td');
    tdViews.textContent = entry.views.toLocaleString();
    tr.appendChild(tdViews);

    // Bounce Rate
    const tdBounce = document.createElement('td');
    tdBounce.textContent = pctStr;
    if (bounceCls) tdBounce.className = bounceCls;
    tr.appendChild(tdBounce);

    // Avg Time
    const tdTime = document.createElement('td');
    if (avgMs === null) {
        tdTime.textContent = '—';
        tdTime.className   = 'null-val';
    } else {
        tdTime.textContent = fmtDuration(avgMs);
    }
    tr.appendChild(tdTime);

    // Suggested Action
    const tdAction = document.createElement('td');
    const badge    = document.createElement('span');
    badge.className   = 'action-badge';
    badge.textContent = action;
    tdAction.appendChild(badge);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
    });

    if (wrap) wrap.hidden = false;
}

// ── Populate trend page <select> ──────────────────────────────────────────

function populateTrendSelect(urlMap) {
    const sel = document.getElementById('trend-page-select');
    if (!sel) return;

    // Remove any existing dynamic options
    while (sel.options.length > 1) sel.remove(1);

    const sorted = [...urlMap.values()]
    .sort((a, b) => b.views - a.views)
    .slice(0, 30);

    for (const entry of sorted) {
    const opt   = document.createElement('option');
    opt.value   = entry.url;
    opt.textContent = pathname(entry.url);
    sel.appendChild(opt);
    }
}

// ── Wire up controls ──────────────────────────────────────────────────────

function bindControls(urlMap, sessionMap, bounceSessions, rows) {
    const barMetric = document.getElementById('bar-metric-select');
    const barTopN   = document.getElementById('bar-topn-select');
    const trendSel  = document.getElementById('trend-page-select');

    function redrawBar() {
    drawTopPagesBar(urlMap, barMetric.value, Number(barTopN.value));
    }

    function redrawTrend() {
    drawTrendLine(urlMap, trendSel.value);
    }

    barMetric.addEventListener('change', redrawBar);
    barTopN.addEventListener('change', redrawBar);
    trendSel.addEventListener('change', redrawTrend);
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
    try {
    const [pageviews, sessions] = await Promise.all([
        apiFetch('/pageviews?limit=1000'),
        apiFetch('/sessions'),
    ]);

    const rows        = pageviews.data ?? [];
    const sessionData = sessions.data  ?? [];

    const { urlMap, bounceSessions, sessionMap } = buildAggregates(rows, sessionData);

    // Tables
    renderTopDetail(urlMap, bounceSessions, rows);
    renderUnderperf(urlMap, bounceSessions);

    // Trend select
    populateTrendSelect(urlMap);

    // Charts
    drawTopPagesBar(urlMap, 'views', 10);
    drawTrendLine(urlMap, '');
    drawEntryExitBar(urlMap, sessionMap);

    // Wire controls after initial render
    bindControls(urlMap, sessionMap, bounceSessions, rows);

    } catch (err) {
    console.error('[performance]', err);
    showError(err.message);

    // Hide loading spinner
    const status = document.getElementById('perf-status');
    if (status) status.hidden = true;
    }
}

document.addEventListener('DOMContentLoaded', init);
