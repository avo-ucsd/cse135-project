/**
 * errors.js — Errors & Reliability analytics page
 * Data sources: /api/errors, /api/pageviews (total count only)
 */

'use strict';

const BASE = '/api';

// ── API helper ────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
  const ct = res.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json'))
    throw new Error(`Unexpected Content-Type "${ct}" for ${path}`);
  return res.json();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pathname(url) {
  try { return new URL(url).pathname; } catch { return String(url); }
}

function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  const fn = (v) => {
    if (domainMax === domainMin) return rangeMin;
    return rangeMin + ((v - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
  };
  fn.domainMin = domainMin; fn.domainMax = domainMax;
  fn.rangeMin  = rangeMin;  fn.rangeMax  = rangeMax;
  return fn;
}

/** Extract error.type and error.message from the raw_payload JSON string. */
function parsePayload(raw) {
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
    return {
      type:    p?.error?.type    ?? '—',
      message: p?.error?.message ?? '—',
    };
  } catch { return { type: '—', message: '—' }; }
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function renderKPIs(errors, pvTotal) {
  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };

  const totalErrors      = errors.reduce((s, r) => s + Number(r.error_count ?? 0), 0);
  const affectedPages    = new Set(errors.map(r => r.url)).size;
  const affectedSessions = new Set(errors.map(r => r.session_id).filter(Boolean)).size;
  const errorRate        = pvTotal > 0 ? ((errors.length / pvTotal) * 100).toFixed(1) + '%' : '—';

  set('[data-kpi="total-errors"] .kpi-value',   totalErrors.toLocaleString());
  set('[data-kpi="affected-pages"] .kpi-value', affectedPages.toLocaleString());
  set('[data-kpi="error-rate"] .kpi-value',     errorRate);
  set('[data-kpi="error-sessions"] .kpi-value', affectedSessions.toLocaleString());
}

// ── Error trend line chart ────────────────────────────────────────────────────

function renderErrorTrendChart(errors) {
  const canvas  = document.getElementById('errorTrendChart');
  const tooltip = document.getElementById('trendTooltip');
  if (!canvas) return;

  // Build 30-day buckets
  const buckets = {};
  const today   = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of errors) {
    const day = String(row.client_timestamp ?? '').slice(0, 10);
    if (Object.prototype.hasOwnProperty.call(buckets, day))
      buckets[day] += Number(row.error_count ?? 1);
  }

  const data   = Object.entries(buckets).map(([key, count]) => ({
    date:  new Date(key + 'T12:00:00'),
    value: count,
  }));

  const ctx = canvas.getContext('2d');
  const M   = { top: 40, right: 25, bottom: 55, left: 60 };
  const CW  = canvas.width  - M.left - M.right;
  const CH  = canvas.height - M.top  - M.bottom;
  const vals   = data.map(d => d.value);
  const yMax   = Math.ceil(Math.max(...vals, 1) / 5) * 5 || 5;
  const xScale = linearScale(0, data.length - 1, M.left, M.left + CW);
  const yScale = linearScale(0, yMax, M.top + CH, M.top);

  function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // grid + y-axis labels
    for (let i = 0; i <= 5; i++) {
      const v = (yMax / 5) * i, y = yScale(v);
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.moveTo(M.left, y); ctx.lineTo(M.left + CW, y); ctx.stroke();
      ctx.fillStyle = '#717a96'; ctx.font = '11px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(v), M.left - 8, y);
    }

    // axes
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
    ctx.moveTo(M.left, M.top); ctx.lineTo(M.left, M.top + CH);
    ctx.lineTo(M.left + CW, M.top + CH); ctx.stroke();

    // x-axis labels
    ctx.fillStyle = '#717a96'; ctx.font = '11px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    data.forEach((pt, i) => {
      if (i % 5 === 0 || i === data.length - 1) {
        const x = xScale(i), y = M.top + CH;
        ctx.beginPath(); ctx.strokeStyle = 'rgb(249,249,249)'; ctx.lineWidth = 2;
        ctx.moveTo(x, y); ctx.lineTo(x, y + 6); ctx.stroke();
        ctx.fillStyle = '#717a96';
        ctx.fillText(pt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, y + 10);
      }
    });

    // filled area
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = xScale(i), y = yScale(pt.value);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xScale(data.length - 1), M.top + CH);
    ctx.lineTo(xScale(0), M.top + CH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, M.top, 0, M.top + CH);
    grad.addColorStop(0, 'rgba(248,113,113,0.25)');
    grad.addColorStop(1, 'rgba(248,113,113,0.02)');
    ctx.fillStyle = grad; ctx.fill();

    // line
    ctx.beginPath(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    data.forEach((pt, i) => {
      const x = xScale(i), y = yScale(pt.value);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // dots
    data.forEach((pt, i) => {
      const x = xScale(i), y = yScale(pt.value);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f87171'; ctx.fill();
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    // title
    ctx.fillStyle = '#e8eaf0'; ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('Daily Errors — Last 30 Days', canvas.width / 2, 10);
  }

  function highlightPoint(index) {
    const x = xScale(index), y = yScale(data[index].value);
    ctx.beginPath(); ctx.strokeStyle = 'rgba(248,113,113,0.3)'; ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(x, M.top); ctx.lineTo(x, M.top + CH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'white'; ctx.fill();
    ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f87171'; ctx.fill();
  }

  canvas.addEventListener('mousemove', e => {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    let ni = -1, nd = Infinity;
    data.forEach((_, i) => { const d = Math.abs(mouseX - xScale(i)); if (d < nd) { nd = d; ni = i; } });

    if (ni >= 0 && nd < 25 * scaleX) {
      const pt = data[ni];
      const px = xScale(ni) / scaleX;
      const py = yScale(pt.value) / scaleX;
      drawChart();
      highlightPoint(ni);
      const dateStr = pt.date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });
      tooltip.innerHTML = '<strong>' + escHtml(dateStr) + '</strong><br>' +
        pt.value.toLocaleString() + ' error' + (pt.value !== 1 ? 's' : '');
      tooltip.style.display = 'block';
      let left = px + 15, top = py - 60;
      if (left + 180 > rect.width) left = px - 190;
      if (top < 0) top = py + 15;
      tooltip.style.left = left + 'px';
      tooltip.style.top  = top  + 'px';
    } else {
      tooltip.style.display = 'none'; drawChart();
    }
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; drawChart(); });

  const keys    = Object.keys(buckets);
  const caption = canvas.closest('figure')?.querySelector('figcaption');
  if (caption && keys.length >= 2)
    caption.textContent = `Daily errors, ${keys[0]} – ${keys[keys.length - 1]}`;

  drawChart();
}

// ── Top affected pages bar chart ──────────────────────────────────────────────

function renderTopPagesChart(errors) {
  const canvas  = document.getElementById('topPagesChart');
  const tooltip = document.getElementById('topPagesTooltip');
  if (!canvas) return;

  const urlMap = new Map();
  for (const row of errors) {
    const url = row.url ?? '(unknown)';
    urlMap.set(url, (urlMap.get(url) ?? 0) + Number(row.error_count ?? 1));
  }
  const top8 = [...urlMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top8.length) return;

  const labels = top8.map(([url]) => {
    const p = pathname(url).replace(/^\//,'');
    return (p || '/').slice(0, 14);
  });
  const values = top8.map(([, c]) => c);

  const ctx    = canvas.getContext('2d');
  const M      = { top: 40, right: 20, bottom: 55, left: 55 };
  const W      = canvas.width  - M.left - M.right;
  const H      = canvas.height - M.top  - M.bottom;
  const yMax   = Math.ceil(Math.max(...values, 1) * 1.2);
  const yScale = linearScale(0, yMax, M.top + H, M.top);
  const step   = W / labels.length;
  const barW   = step * 0.55;

  function draw(hi = -1) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // title
    ctx.fillStyle = '#e8eaf0'; ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('Top Affected Pages', canvas.width / 2, 10);

    // grid + y labels
    for (let i = 0; i <= 5; i++) {
      const v = (yMax / 5) * i, y = yScale(v);
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.moveTo(M.left, y); ctx.lineTo(M.left + W, y); ctx.stroke();
      ctx.fillStyle = '#717a96'; ctx.font = '11px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(v), M.left - 7, y);
    }

    // axes
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
    ctx.moveTo(M.left, M.top); ctx.lineTo(M.left, M.top + H);
    ctx.lineTo(M.left + W, M.top + H); ctx.stroke();

    // bars + x labels
    labels.forEach((lbl, i) => {
      const x  = M.left + step * i + step / 2 - barW / 2;
      const bH = yScale(0) - yScale(values[i]);
      const y  = yScale(values[i]);
      ctx.fillStyle = i === hi ? 'rgba(248,113,113,0.9)' : 'rgba(248,113,113,0.55)';
      ctx.beginPath(); ctx.roundRect(x, y, barW, bH, [4, 4, 0, 0]); ctx.fill();
      ctx.fillStyle = '#717a96'; ctx.font = '11px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(lbl, x + barW / 2, M.top + H + 8);
    });
  }

  draw();

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (canvas.width / rect.width);
    let hi = -1;
    labels.forEach((_, i) => { if (Math.abs(mx - (M.left + step * i + step / 2)) < step / 2) hi = i; });
    if (hi >= 0) {
      draw(hi);
      const scaleX    = canvas.width  / rect.width;
      const scaleY    = canvas.height / rect.height;
      const cx        = (M.left + step * hi + step / 2) / scaleX;
      const ty        = yScale(values[hi]) / scaleY;
      const fullPath  = pathname(top8[hi][0]);
      const TW        = 180;
      let left        = cx - TW / 2;
      let top         = ty - 55;
      if (left < 0)              left = 0;
      if (left + TW > rect.width) left = rect.width - TW;
      if (top < 0)               top  = ty + 10;
      tooltip.innerHTML = `<strong>${escHtml(fullPath)}</strong><br>${values[hi].toLocaleString()} error${values[hi] !== 1 ? 's' : ''}`;
      tooltip.style.display = 'block';
      tooltip.style.left = `${left}px`;
      tooltip.style.top  = `${top}px`;
    } else {
      tooltip.style.display = 'none'; draw();
    }
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; draw(); });
}

// ── Recent error log table ────────────────────────────────────────────────────

function renderErrorLog(errors) {
  const tbody = document.querySelector('#error-log-heading')?.closest('section')?.querySelector('tbody');
  if (!tbody) return;

  tbody.innerHTML = errors.slice(0, 50).map(row => {
    const { type, message } = parsePayload(row.raw_payload);
    const time = row.client_timestamp
      ? new Date(row.client_timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
      : '—';
    const path = pathname(row.url ?? '');
    const sid  = String(row.session_id ?? '').slice(0, 10);
    const msg  = String(message).slice(0, 60) + (String(message).length > 60 ? '…' : '');
    return `
      <tr>
        <td>${escHtml(time)}</td>
        <td><a href="${escHtml(row.url ?? '')}" title="${escHtml(row.url ?? '')}">${escHtml(path)}</a></td>
        <td class="error-val">${escHtml(type)}</td>
        <td title="${escHtml(String(message))}">${escHtml(msg)}</td>
        <td class="error-val">${Number(row.error_count ?? 1).toLocaleString()}</td>
        <td title="${escHtml(row.session_id ?? '')}">${escHtml(sid)}${sid ? '…' : '—'}</td>
      </tr>`;
  }).join('');
}

// ── Top pages by error count table ────────────────────────────────────────────

function renderTopPagesTable(errors) {
  const tbody = document.getElementById('topPagesTableBody');
  if (!tbody) return;

  const urlMap = new Map();
  for (const row of errors) {
    const url = row.url ?? '(unknown)';
    if (!urlMap.has(url)) urlMap.set(url, { count: 0, last: '' });
    const entry = urlMap.get(url);
    entry.count += Number(row.error_count ?? 1);
    if (!entry.last || (row.client_timestamp ?? '') > entry.last)
      entry.last = row.client_timestamp ?? '';
  }

  const sorted = [...urlMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15);

  tbody.innerHTML = sorted.map(([url, s], i) => {
    const path = pathname(url);
    const last = s.last
      ? new Date(s.last).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
      : '—';
    return `
      <tr>
        <td>${i + 1}</td>
        <td><a href="${escHtml(url)}" title="${escHtml(url)}">${escHtml(path)}</a></td>
        <td class="error-val">${s.count.toLocaleString()}</td>
        <td>${escHtml(last)}</td>
      </tr>`;
  }).join('');
}

// ── Error banner ──────────────────────────────────────────────────────────────

function showError(msg) {
  const b = document.createElement('p');
  b.setAttribute('role', 'alert');
  b.style.cssText = 'background:#f87171;color:#0f1117;padding:.75rem 1.25rem;border-radius:8px;margin:1rem;font-weight:600';
  b.textContent = `Analytics failed to load: ${msg}`;
  document.querySelector('main')?.prepend(b);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [errData, pvMeta] = await Promise.all([
      apiFetch('/errors'),
      apiFetch('/pageviews?limit=1'),
    ]);
    const errors  = errData.data ?? [];
    const pvTotal = pvMeta.total  ?? 0;
    renderKPIs(errors, pvTotal);
    renderErrorTrendChart(errors);
    renderTopPagesChart(errors);
    renderErrorLog(errors);
    renderTopPagesTable(errors);
  } catch (err) {
    console.error('[errors]', err);
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
