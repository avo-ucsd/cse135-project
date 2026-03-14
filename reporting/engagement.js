/**
 * engagement.js - Engagement analytics page
 * Data sources: /api/sessions and /api/pageviews
 */

'use strict';

const BASE = '/api';

const state = {
  sessions: [],
  filtered: [],
  activeWindow: 30,
  compareMode: 'visitor',
  cohortGranularity: 'week',
  filters: {
    browser: 'all',
    device: 'all',
    channel: 'all',
    country: 'all',
  },
};

async function apiFetch(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`API ${path} -> HTTP ${res.status}`);
  const ct = res.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) {
    throw new Error(`Unexpected Content-Type "${ct}" for ${path}`);
  }
  return res.json();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function toTime(ts) {
  const t = new Date(ts ?? '').getTime();
  return Number.isFinite(t) ? t : null;
}

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function detectDevice(ua) {
  if (!ua) return 'Unknown';
  const u = ua.toLowerCase();
  if (u.includes('ipad') || u.includes('tablet')) return 'Tablet';
  if (u.includes('mobile') || u.includes('android') || u.includes('iphone')) return 'Mobile';
  return 'Desktop';
}

function detectBrowser(ua) {
  if (!ua) return 'Unknown';
  const u = ua.toLowerCase();
  if (u.includes('edg/')) return 'Edge';
  if (u.includes('opr/') || u.includes('opera')) return 'Opera';
  if (u.includes('firefox/')) return 'Firefox';
  if (u.includes('safari/') && !u.includes('chrome/')) return 'Safari';
  if (u.includes('chrome/')) return 'Chrome';
  return 'Other';
}

function detectCountry(language) {
  if (!language) return 'Unknown';
  const m = String(language).match(/-([A-Za-z]{2})$/);
  return m ? m[1].toUpperCase() : String(language).slice(0, 2).toUpperCase();
}

function parseHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function deriveChannel(referrer, firstUrl) {
  const ref = String(referrer ?? '').trim();
  const refHost = parseHost(ref);
  if (refHost) {
    if (/google|bing|duckduckgo|yahoo/.test(refHost)) return 'Organic Search';
    if (/facebook|instagram|linkedin|twitter|t\.co|reddit/.test(refHost)) return 'Social';
    if (!/teamate\.site/.test(refHost)) return 'Referral';
  }
  const path = (() => {
    try { return new URL(firstUrl ?? '', 'https://teamate.site').pathname.toLowerCase(); }
    catch { return String(firstUrl ?? '').toLowerCase(); }
  })();
  if (path.startsWith('/members')) return 'Members';
  if (path.startsWith('/hw')) return 'Homework';
  return 'Direct';
}

function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  return (value) => {
    if (domainMax === domainMin) return rangeMin;
    return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
  };
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value;
}

function avg(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function groupBy(rows, keyFn) {
  const out = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const arr = out.get(key) ?? [];
    arr.push(row);
    out.set(key, arr);
  }
  return out;
}

function enrichSessions(sessions, pageviews) {
  const firstPvBySession = new Map();
  for (const pv of pageviews) {
    const sid = pv.session_id;
    if (!sid) continue;
    const t = toTime(pv.page_entered_at ?? pv.client_timestamp ?? pv.received_at);
    if (t === null) continue;
    const prev = firstPvBySession.get(sid);
    if (!prev || t < prev.time) {
      firstPvBySession.set(sid, { time: t, row: pv });
    }
  }

  const base = sessions
    .map((s) => {
      const startMs = toTime(s.session_start);
      const endMs = toTime(s.session_end);
      if (startMs === null || endMs === null || endMs < startMs) return null;
      const pv = firstPvBySession.get(s.session_id)?.row;
      const ua = s.user_agent ?? pv?.user_agent ?? '';
      const language = s.language ?? pv?.language ?? 'Unknown';
      const pages = Number(s.pageview_count ?? 0);
      const totalErrors = Number(s.total_errors ?? 0);
      const firstUrl = s.first_url ?? pv?.url ?? '';
      const referrer = pv?.referrer ?? '';

      return {
        sessionId: String(s.session_id ?? ''),
        startMs,
        endMs,
        startISO: new Date(startMs).toISOString(),
        durationMs: endMs - startMs,
        pages,
        totalErrors,
        ua,
        language,
        firstUrl,
        referrer,
        device: detectDevice(ua),
        browser: detectBrowser(ua),
        country: detectCountry(language),
        channel: deriveChannel(referrer, firstUrl),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);

  const signatures = groupBy(base, (s) => `${s.ua}|${s.language}`);
  for (const rows of signatures.values()) {
    rows.sort((a, b) => a.startMs - b.startMs);
    rows.forEach((row, i) => {
      row.signature = `${row.ua}|${row.language}`;
      row.visitorType = i === 0 ? 'New' : 'Returning';
    });
  }

  return base.sort((a, b) => b.startMs - a.startMs);
}

function renderKPIs(rows) {
  setText('[data-kpi="sessions"] .kpi-value', rows.length.toLocaleString());
  setText('[data-kpi="avg-session"] .kpi-value', fmtDuration(avg(rows.map((r) => r.durationMs))));
  setText('[data-kpi="pages-per-session"] .kpi-value', avg(rows.map((r) => r.pages)).toFixed(1));
  const bouncePct = rows.length ? (rows.filter((r) => r.pages === 1).length / rows.length) * 100 : 0;
  setText('[data-kpi="bounce"] .kpi-value', `${bouncePct.toFixed(1)}%`);
}

function renderSimpleBarChart(canvas, tooltipEl, labels, values, title, options = {}) {
  if (!canvas || !labels.length) return;
  const ctx = canvas.getContext('2d');
  const M = { top: 36, right: 18, bottom: 58, left: 50 };
  const W = canvas.width - M.left - M.right;
  const H = canvas.height - M.top - M.bottom;
  const yMax = Math.max(1, Math.ceil(Math.max(...values) * 1.2));
  const yScale = linearScale(0, yMax, M.top + H, M.top);
  const step = W / labels.length;
  const barW = step * 0.62;

  const draw = (highlight = -1) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#e8eaf0';
    ctx.font = '600 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, canvas.width / 2, 15);

    for (let i = 0; i <= 5; i++) {
      const v = (yMax / 5) * i;
      const y = yScale(v);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.moveTo(M.left, y);
      ctx.lineTo(M.left + W, y);
      ctx.stroke();
      ctx.fillStyle = '#717a96';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(v)), M.left - 6, y + 3);
    }

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.moveTo(M.left, M.top);
    ctx.lineTo(M.left, M.top + H);
    ctx.lineTo(M.left + W, M.top + H);
    ctx.stroke();

    labels.forEach((label, i) => {
      const x = M.left + step * i + step / 2 - barW / 2;
      const y = yScale(values[i]);
      const h = yScale(0) - y;

      ctx.fillStyle = i === highlight ? 'rgba(185,79,247,0.88)' : 'rgba(185,79,247,0.58)';
      ctx.fillRect(x, y, barW, h);

      ctx.fillStyle = '#717a96';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barW / 2, M.top + H + 14);
    });
  };

  draw();

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    let idx = -1;
    for (let i = 0; i < labels.length; i++) {
      const cx = M.left + step * i + step / 2;
      if (Math.abs(mx - cx) <= step / 2) idx = i;
    }
    if (idx < 0) {
      tooltipEl.style.display = 'none';
      draw();
      return;
    }

    draw(idx);
    const suffix = options.tooltipSuffix ?? '';
    tooltipEl.innerHTML = `<strong>${escHtml(labels[idx])}</strong><br>${values[idx].toLocaleString()}${suffix}`;
    tooltipEl.style.display = 'block';
    const left = Math.min(Math.max((e.clientX - rect.left) - 70, 4), rect.width - 150);
    const top = Math.max((e.clientY - rect.top) - 50, 4);
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  };

  canvas.onmouseleave = () => {
    tooltipEl.style.display = 'none';
    draw();
  };
}

function renderTrendChart(rows, days) {
  const canvas = document.getElementById('trendChart');
  const tooltipEl = document.getElementById('trendTooltip');
  if (!canvas) return;

  const end = Date.now();
  const start = end - (days * 24 * 60 * 60 * 1000);
  const keys = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += dayMs) keys.push(dayKey(t));

  const bins = new Map(keys.map((k) => [k, []]));
  for (const row of rows) {
    if (row.startMs < start || row.startMs > end) continue;
    const key = dayKey(row.startMs);
    const arr = bins.get(key);
    if (arr) arr.push(row);
  }

  const points = keys.map((key) => {
    const arr = bins.get(key) ?? [];
    const durationMin = avg(arr.map((r) => r.durationMs / 60000));
    const pages = avg(arr.map((r) => r.pages));
    const bounce = arr.length ? (arr.filter((r) => r.pages === 1).length / arr.length) * 100 : 0;
    return {
      label: key,
      durationMin,
      pages,
      bounce,
    };
  });

  const ctx = canvas.getContext('2d');
  const M = { top: 28, right: 46, bottom: 40, left: 56 };
  const W = canvas.width - M.left - M.right;
  const H = canvas.height - M.top - M.bottom;
  const leftMax = Math.max(1, Math.ceil(Math.max(...points.map((p) => Math.max(p.durationMin, p.pages))) * 1.2));
  const xScale = linearScale(0, Math.max(1, points.length - 1), M.left, M.left + W);
  const yLeft = linearScale(0, leftMax, M.top + H, M.top);
  const yRight = linearScale(0, 100, M.top + H, M.top);

  const drawLine = (vals, yScale, color) => {
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = xScale(i);
      const y = yScale(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const draw = (hi = -1) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i <= 5; i++) {
      const v = (leftMax / 5) * i;
      const y = yLeft(v);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.moveTo(M.left, y);
      ctx.lineTo(M.left + W, y);
      ctx.stroke();

      ctx.fillStyle = '#717a96';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(1), M.left - 8, y + 3);
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.round((100 / 5) * i)), M.left + W + 8, y + 3);
    }

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.moveTo(M.left, M.top);
    ctx.lineTo(M.left, M.top + H);
    ctx.moveTo(M.left + W, M.top);
    ctx.lineTo(M.left + W, M.top + H);
    ctx.moveTo(M.left, M.top + H);
    ctx.lineTo(M.left + W, M.top + H);
    ctx.stroke();

    const durationVals = points.map((p) => p.durationMin);
    const pageVals = points.map((p) => p.pages);
    const bounceVals = points.map((p) => p.bounce);
    drawLine(durationVals, yLeft, '#34d399');
    drawLine(pageVals, yLeft, '#60a5fa');
    drawLine(bounceVals, yRight, '#f59e0b');

    const stride = Math.max(1, Math.floor(points.length / 8));
    for (let i = 0; i < points.length; i += stride) {
      const x = xScale(i);
      const label = points[i].label.slice(5);
      ctx.fillStyle = '#717a96';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, M.top + H + 16);
    }

    const legend = [
      { text: 'Avg Session (min)', color: '#34d399' },
      { text: 'Pages / Session', color: '#60a5fa' },
      { text: 'Bounce Rate %', color: '#f59e0b' },
    ];
    let lx = M.left;
    for (const item of legend) {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, 8, 8, 8);
      ctx.fillStyle = '#c6cad6';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(item.text, lx + 12, 15);
      lx += 122;
    }

    if (hi >= 0) {
      const x = xScale(hi);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.moveTo(x, M.top);
      ctx.lineTo(x, M.top + H);
      ctx.stroke();
    }
  };

  draw();

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(((mx - M.left) / W) * (points.length - 1))));
    const point = points[idx];
    draw(idx);
    tooltipEl.innerHTML = `<strong>${point.label}</strong><br>Avg session: ${point.durationMin.toFixed(2)} min<br>Pages/session: ${point.pages.toFixed(2)}<br>Bounce: ${point.bounce.toFixed(1)}%`;
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = `${Math.min(Math.max(e.clientX - rect.left - 90, 4), rect.width - 190)}px`;
    tooltipEl.style.top = `${Math.max(e.clientY - rect.top - 80, 4)}px`;
  };

  canvas.onmouseleave = () => {
    tooltipEl.style.display = 'none';
    draw();
  };
}

function renderDurationHistogram(rows) {
  const labels = ['0-1m', '1-2m', '2-3m', '3-4m', '4-5m', '5-6m', '6-7m', '7-8m', '8-9m', '9-10m', '10m+'];
  const counts = new Array(labels.length).fill(0);
  for (const row of rows) {
    const min = row.durationMs / 60000;
    const idx = min >= 10 ? 10 : Math.max(0, Math.floor(min));
    counts[idx] += 1;
  }
  renderSimpleBarChart(
    document.getElementById('durationChart'),
    document.getElementById('durationTooltip'),
    labels,
    counts,
    'Session duration histogram',
    { tooltipSuffix: ' sessions' }
  );
}

function renderDepthCohort(rows, mode) {
  let labels = [];
  let values = [];
  let suffix = ' avg pages';

  if (mode === 'visitor') {
    const grouped = groupBy(rows, (r) => r.visitorType);
    labels = ['New', 'Returning'];
    values = labels.map((k) => Number(avg((grouped.get(k) ?? []).map((r) => r.pages)).toFixed(2)));
  } else {
    const grouped = groupBy(rows, (r) => r.channel);
    const entries = [...grouped.entries()]
      .map(([channel, list]) => ({ channel, sessions: list.length, avgPages: avg(list.map((r) => r.pages)) }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 6);
    labels = entries.map((e) => e.channel);
    values = entries.map((e) => Number(e.avgPages.toFixed(2)));
    suffix = ' avg pages/session';
  }

  renderSimpleBarChart(
    document.getElementById('depthChart'),
    document.getElementById('depthTooltip'),
    labels,
    values,
    mode === 'visitor' ? 'Pages/session: New vs Returning' : 'Pages/session: Channel comparison',
    { tooltipSuffix: suffix }
  );
}

function renderSegmentsTable(rows) {
  const tbody = document.getElementById('segmentsBody');
  if (!tbody) return;

  const segmentRows = [];
  const dims = [
    { label: 'Device', key: 'device' },
    { label: 'Country', key: 'country' },
    { label: 'Channel', key: 'channel' },
  ];

  for (const dim of dims) {
    const grouped = groupBy(rows, (r) => r[dim.key] ?? 'Unknown');
    for (const [value, list] of grouped.entries()) {
      const bounce = list.length ? (list.filter((r) => r.pages === 1).length / list.length) * 100 : 0;
      segmentRows.push({
        segment: `${dim.label}: ${value}`,
        sessions: list.length,
        avgSession: avg(list.map((r) => r.durationMs)),
        pages: avg(list.map((r) => r.pages)),
        bounce,
      });
    }
  }

  const top = segmentRows.sort((a, b) => b.sessions - a.sessions).slice(0, 12);
  tbody.innerHTML = top.map((row) => `
    <tr>
      <td>${escHtml(row.segment)}</td>
      <td>${row.sessions.toLocaleString()}</td>
      <td>${fmtDuration(row.avgSession)}</td>
      <td>${row.pages.toFixed(2)}</td>
      <td>${row.bounce.toFixed(1)}%</td>
    </tr>
  `).join('');
}

function weekKey(ms) {
  const d = new Date(ms);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(ms) {
  return new Date(ms).toISOString().slice(0, 7);
}

function renderCohortTable(rows, granularity) {
  const tbody = document.getElementById('cohortBody');
  if (!tbody) return;

  const bySig = groupBy(rows, (r) => r.signature ?? r.sessionId);
  const cohorts = new Map();

  for (const sessions of bySig.values()) {
    sessions.sort((a, b) => a.startMs - b.startMs);
    const first = sessions[0];
    const cohort = granularity === 'month' ? monthKey(first.startMs) : weekKey(first.startMs);
    const key = cohort;
    const agg = cohorts.get(key) ?? { users: 0, d7: 0, d30: 0, d90: 0 };
    agg.users += 1;

    const hasAfter = (days) => sessions.some((s) => (s.startMs - first.startMs) >= (days * 86400000));
    if (hasAfter(7)) agg.d7 += 1;
    if (hasAfter(30)) agg.d30 += 1;
    if (hasAfter(90)) agg.d90 += 1;
    cohorts.set(key, agg);
  }

  const entries = [...cohorts.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
  tbody.innerHTML = entries.map(([cohort, v]) => `
    <tr>
      <td>${cohort}</td>
      <td>${v.users.toLocaleString()}</td>
      <td>${v.users ? ((v.d7 / v.users) * 100).toFixed(1) : '0.0'}%</td>
      <td>${v.users ? ((v.d30 / v.users) * 100).toFixed(1) : '0.0'}%</td>
      <td>${v.users ? ((v.d90 / v.users) * 100).toFixed(1) : '0.0'}%</td>
    </tr>
  `).join('');
}

function renderSessionsTable(rows) {
  const tbody = document.getElementById('sessionsBody');
  if (!tbody) return;
  const top = rows.slice(0, 10);
  tbody.innerHTML = top.map((row) => `
    <tr>
      <td title="${escHtml(row.sessionId)}">${escHtml(row.sessionId.slice(0, 12))}...</td>
      <td>${escHtml(row.startISO.replace('T', ' ').slice(0, 19))}</td>
      <td>${fmtDuration(row.durationMs)}</td>
      <td>${row.pages.toLocaleString()}</td>
      <td>${row.pages === 1 ? 'Yes' : 'No'}</td>
      <td>${escHtml(row.device)}</td>
    </tr>
  `).join('');
}

function populateFilterOptions(rows) {
  const defs = [
    { id: 'filterBrowser', key: 'browser' },
    { id: 'filterDevice', key: 'device' },
    { id: 'filterChannel', key: 'channel' },
    { id: 'filterCountry', key: 'country' },
  ];

  for (const def of defs) {
    const sel = document.getElementById(def.id);
    if (!sel) continue;
    const values = [...new Set(rows.map((r) => r[def.key]).filter(Boolean))].sort();
    sel.innerHTML = '<option value="all">All</option>' + values.map((v) => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
  }
}

function applyFilters() {
  const f = state.filters;
  state.filtered = state.sessions.filter((r) =>
    (f.browser === 'all' || r.browser === f.browser) &&
    (f.device === 'all' || r.device === f.device) &&
    (f.channel === 'all' || r.channel === f.channel) &&
    (f.country === 'all' || r.country === f.country)
  );
  renderAggregation(state.filtered);
  renderSessionsTable(state.filtered);
}

function syncFiltersFromDOM() {
  state.filters.browser = document.getElementById('filterBrowser')?.value ?? 'all';
  state.filters.device = document.getElementById('filterDevice')?.value ?? 'all';
  state.filters.channel = document.getElementById('filterChannel')?.value ?? 'all';
  state.filters.country = document.getElementById('filterCountry')?.value ?? 'all';
}

function renderAggregation(rows) {
  setText('[data-agg="sessions"]', rows.length.toLocaleString());
  setText('[data-agg="duration"]', fmtDuration(avg(rows.map((r) => r.durationMs))));
  setText('[data-agg="pages"]', avg(rows.map((r) => r.pages)).toFixed(2));
  setText('[data-agg="errors"]', rows.reduce((acc, r) => acc + r.totalErrors, 0).toLocaleString());

  const bits = [];
  for (const [k, v] of Object.entries(state.filters)) {
    if (v !== 'all') bits.push(`${k}: ${v}`);
  }
  setText('#aggregationSummary', bits.length ? `Filtered by ${bits.join(', ')}.` : 'Showing all sessions.');
}

function bindEvents() {
  for (const btn of document.querySelectorAll('.segmented-control button[data-window]')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segmented-control button').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      state.activeWindow = Number(btn.dataset.window);
      renderTrendChart(state.sessions, state.activeWindow);
    });
  }

  const compareSel = document.getElementById('cohortCompare');
  compareSel?.addEventListener('change', () => {
    state.compareMode = compareSel.value;
    renderDepthCohort(state.sessions, state.compareMode);
  });

  const cohortGranularity = document.getElementById('cohortGranularity');
  cohortGranularity?.addEventListener('change', () => {
    state.cohortGranularity = cohortGranularity.value;
    renderCohortTable(state.sessions, state.cohortGranularity);
  });

  for (const id of ['filterBrowser', 'filterDevice', 'filterChannel', 'filterCountry']) {
    document.getElementById(id)?.addEventListener('change', () => {
      syncFiltersFromDOM();
      applyFilters();
    });
  }

  document.getElementById('clearFilters')?.addEventListener('click', () => {
    state.filters = { browser: 'all', device: 'all', channel: 'all', country: 'all' };
    document.getElementById('filterBrowser').value = 'all';
    document.getElementById('filterDevice').value = 'all';
    document.getElementById('filterChannel').value = 'all';
    document.getElementById('filterCountry').value = 'all';
    applyFilters();
  });
}

function showError(msg) {
  const b = document.createElement('p');
  b.setAttribute('role', 'alert');
  b.style.cssText = 'background:#f87171;color:#0f1117;padding:.75rem 1.25rem;border-radius:8px;margin:1rem;font-weight:600';
  b.textContent = `Analytics failed to load: ${msg}`;
  document.querySelector('main')?.prepend(b);
}

function getReportId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('reportId') || 'current';
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

function initReportActions() {
  const saveBtn = document.getElementById('saveReportBtn');
  const uploadBtn = document.getElementById('uploadReportPdfBtn');
  const fileInput = document.getElementById('reportPdfInput');
  if (!saveBtn || !uploadBtn || !fileInput) return;

  function getCurrentReportId() {
    return getReportId() === 'current' ? '' : getReportId();
  }

  async function findReportPkByReportId(reportId) {
    const q = new URLSearchParams({ report_id: reportId, page: 'engagement', category: 'Engagement', limit: '1' });
    const res = await apiFetch(`/reports?${q.toString()}`);
    return Number(res?.data?.[0]?.id ?? 0);
  }

  saveBtn.addEventListener('click', async () => {
    const name = window.prompt('Report name:', `Engagement Report — ${new Date().toLocaleDateString('en-US')}`);
    if (!name) return;

    try {
      const res = await fetch(BASE + '/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'Engagement',
          page: 'engagement',
          report_name: name.trim(),
          created_by: 'Analyst',
          source_url: window.location.href,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} ${body}`);
      }

      const payload = await res.json();
      const reportId = payload?.report_id;
      if (!reportId) throw new Error('Missing report_id from API');

      const baseUrl = window.location.pathname;
      const printUrl = `${baseUrl}?reportId=${encodeURIComponent(reportId)}&print=1`;
      window.location.href = printUrl;
    } catch (err) {
      console.error('[engagement:reports] create failed', err);
      window.alert('Failed to create server report record.');
    }
  });

  uploadBtn.addEventListener('click', () => {
    const reportId = getCurrentReportId();
    if (!reportId) {
      window.alert('Save the report first so a report ID exists, then upload the PDF.');
      return;
    }
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const reportId = getCurrentReportId();
    const file = fileInput.files?.[0];
    if (!reportId || !file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      window.alert('Please select a PDF file.');
      return;
    }

    try {
      const reportPk = await findReportPkByReportId(reportId);
      if (!reportPk) {
        window.alert('Could not find server report record for this report ID.');
        return;
      }

      const fd = new FormData();
      fd.append('pdf', file);
      const up = await fetch(`${BASE}/reports/${reportPk}`, {
        method: 'POST',
        body: fd,
      });

      if (!up.ok) {
        const body = await up.text();
        throw new Error(`HTTP ${up.status} ${body}`);
      }

      window.alert('PDF uploaded to server successfully.');
    } catch (err) {
      console.error('[engagement:reports] upload failed', err);
      window.alert('Failed to upload PDF to server.');
    }
  });
}

function maybeAutoPrint() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('print') === '1') {
    window.setTimeout(() => window.print(), 600);
  }
}

function initAnalystNotes() {
  const notes = document.getElementById('analystNotes');
  const meta = document.getElementById('notesMeta');
  if (!notes || !meta) return;

  const reportId = getReportId();
  const category = 'Engagement';
  const page = 'engagement';
  meta.textContent = 'Loading note...';

  async function loadNote() {
    try {
      const q = new URLSearchParams({
        category,
        page,
        report_id: reportId,
        limit: '1',
      });
      const res = await apiFetch(`/notes?${q.toString()}`);
      const row = (res.data ?? [])[0];
      if (row) {
        notes.value = row.note_text ?? '';
        meta.textContent = `Last saved ${formatDateTime(row.updated_at ?? row.created_at)}`;
      } else {
        notes.value = '';
        meta.textContent = 'Not saved yet';
      }
    } catch (err) {
      console.error('[engagement:notes] load failed', err);
      meta.textContent = 'Could not load note from server';
    }
  }

  let saveTimer;
  notes.addEventListener('input', () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      const noteText = notes.value.trim();
      if (!noteText) {
        meta.textContent = 'Not saved yet';
        return;
      }

      try {
        const res = await fetch(BASE + '/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            report_id: reportId,
            page,
            analyst_name: 'Analyst',
            note_text: noteText,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status} ${body}`);
        }
        const payload = await res.json();
        const stampSource = payload?.data?.updated_at ?? payload?.data?.created_at ?? new Date().toISOString();
        meta.textContent = `Last saved ${formatDateTime(stampSource)}`;
      } catch (err) {
        console.error('[engagement:notes] save failed', err);
        meta.textContent = 'Failed to save note on server';
      }
    }, 500);
  });

  loadNote();
}

function initComments() {
  const form = document.getElementById('commentForm');
  const list = document.getElementById('commentList');
  if (!form || !list) return;

  const reportId = getReportId();
  const category = 'Engagement';
  const page = 'engagement';

  function commentCardHtml(c) {
    const id = Number(c.id ?? 0);
    const name = c.analyst_name ?? c.name ?? 'Anonymous';
    const text = c.message ?? c.text ?? '';
    const created = c.created_at ?? c.createdAt ?? new Date().toISOString();
    const nameEnc = encodeURIComponent(name);
    const textEnc = encodeURIComponent(text);
    const createdEnc = encodeURIComponent(created);

    return `
      <div class="comment-card" data-id="${id}" data-name-enc="${nameEnc}" data-text-enc="${textEnc}" data-created-enc="${createdEnc}">
        <div class="comment-meta">${escHtml(name)} · ${escHtml(formatDateTime(created))}</div>
        <div class="comment-text">${escHtml(text)}</div>
        <div class="comment-actions">
          <button class="comment-btn" type="button" data-action="edit" data-id="${id}">Edit</button>
          <button class="comment-btn danger" type="button" data-action="delete" data-id="${id}">Delete</button>
        </div>
      </div>
    `;
  }

  function renderInlineEditor(card) {
    const id = Number(card.dataset.id || 0);
    const name = decodeURIComponent(card.dataset.nameEnc || 'Anonymous');
    const text = decodeURIComponent(card.dataset.textEnc || '');
    const created = decodeURIComponent(card.dataset.createdEnc || new Date().toISOString());

    card.classList.add('comment-card-editing');
    card.innerHTML = `
      <div class="comment-meta">Editing comment · ${escHtml(formatDateTime(created))}</div>
      <input class="comment-edit-name" type="text" value="${escHtml(name)}" maxlength="100" />
      <textarea class="comment-edit-text" rows="4" maxlength="5000">${escHtml(text)}</textarea>
      <div class="comment-actions">
        <button class="comment-btn" type="button" data-action="save-edit" data-id="${id}">Save</button>
        <button class="comment-btn secondary" type="button" data-action="cancel-edit" data-id="${id}">Cancel</button>
      </div>
    `;
  }

  function restoreCard(card) {
    const id = Number(card.dataset.id || 0);
    const name = decodeURIComponent(card.dataset.nameEnc || 'Anonymous');
    const text = decodeURIComponent(card.dataset.textEnc || '');
    const created = decodeURIComponent(card.dataset.createdEnc || new Date().toISOString());
    card.outerHTML = commentCardHtml({ id, analyst_name: name, message: text, created_at: created });
  }

  function render(comments) {
    if (!comments.length) {
      list.innerHTML = '<p class="empty-state">No comments yet.</p>';
      return;
    }
    list.innerHTML = comments.map(commentCardHtml).join('');
  }

  async function refreshComments() {
    try {
      const q = new URLSearchParams({
        category,
        page,
        report_id: reportId,
        limit: '200',
      });
      const res = await apiFetch(`/comments?${q.toString()}`);
      render(res.data ?? []);
    } catch (err) {
      console.error('[engagement:comments] load failed', err);
      list.innerHTML = '<p class="empty-state">Could not load comments from server.</p>';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const text = form.comment.value.trim();
    if (!name || !text) return;

    try {
      const res = await fetch(BASE + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          report_id: reportId,
          page,
          analyst_name: name,
          message: text,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} ${body}`);
      }

      form.reset();
      await refreshComments();
    } catch (err) {
      console.error('[engagement:comments] post failed', err);
      window.alert('Failed to save comment on server. Please try again.');
    }
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action][data-id]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!id) return;
    const card = btn.closest('.comment-card');
    if (!card) return;

    const action = btn.dataset.action;
    if (action === 'delete') {
      const ok = window.confirm('Delete this comment?');
      if (!ok) return;

      try {
        const res = await fetch(`${BASE}/comments/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status} ${body}`);
        }
        await refreshComments();
      } catch (err) {
        console.error('[engagement:comments] delete failed', err);
        window.alert('Failed to delete comment on server.');
      }
      return;
    }

    if (action === 'edit') {
      renderInlineEditor(card);
      return;
    }

    if (action === 'cancel-edit') {
      restoreCard(card);
      return;
    }

    if (action === 'save-edit') {
      const nameInput = card.querySelector('.comment-edit-name');
      const textInput = card.querySelector('.comment-edit-text');
      const trimmedName = (nameInput?.value ?? '').trim();
      const trimmedText = (textInput?.value ?? '').trim();
      if (!trimmedName || !trimmedText) {
        window.alert('Name and comment are required.');
        return;
      }

      try {
        const res = await fetch(`${BASE}/comments/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analyst_name: trimmedName,
            message: trimmedText,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status} ${body}`);
        }
        await refreshComments();
      } catch (err) {
        console.error('[engagement:comments] edit failed', err);
        window.alert('Failed to edit comment on server.');
      }
      return;
    }
  });

  refreshComments();
}

async function init() {
  try {
    const [sessionsRes, pageviewsRes] = await Promise.all([
      apiFetch('/sessions'),
      apiFetch('/pageviews?limit=1000'),
    ]);

    state.sessions = enrichSessions(sessionsRes.data ?? [], pageviewsRes.data ?? []);
    state.filtered = [...state.sessions];

    renderKPIs(state.sessions);
    renderTrendChart(state.sessions, state.activeWindow);
    renderDurationHistogram(state.sessions);
    renderDepthCohort(state.sessions, state.compareMode);
    renderSegmentsTable(state.sessions);
    renderCohortTable(state.sessions, state.cohortGranularity);
    renderSessionsTable(state.filtered);
    populateFilterOptions(state.sessions);
    renderAggregation(state.filtered);
    bindEvents();
    initReportActions();
    initAnalystNotes();
    initComments();
    maybeAutoPrint();
  } catch (err) {
    console.error('[engagement]', err);
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);