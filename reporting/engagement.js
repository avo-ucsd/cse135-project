/**
 * engagement.js — Engagement analytics page
 * Data source: /api/sessions
 */

'use strict';

const BASE = '/api';

async function apiFetch(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
  const ct = res.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json'))
    throw new Error(`Unexpected Content-Type "${ct}" for ${path}`);
  return res.json();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function detectDevice(ua) {
  if (!ua) return 'Unknown';
  const u = ua.toLowerCase();
  if (u.includes('mobile') || u.includes('android') || u.includes('iphone')) return 'Mobile';
  if (u.includes('tablet') || u.includes('ipad')) return 'Tablet';
  return 'Desktop';
}

function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  return (v) => {
    if (domainMax === domainMin) return rangeMin;
    return rangeMin + ((v - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
  };
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function renderKPIs(data) {
  const set = (sel, val) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = val;
  };

  set('[data-kpi="sessions"] .kpi-value', data.length.toLocaleString());

  const durations = data
    .map(s => { const d = new Date(s.session_end) - new Date(s.session_start); return Number.isFinite(d) && d >= 0 ? d : null; })
    .filter(d => d !== null);
  if (durations.length)
    set('[data-kpi="avg-session"] .kpi-value', fmtDuration(durations.reduce((a, b) => a + b, 0) / durations.length));

  const counts = data.map(s => Number(s.pageview_count));
  if (counts.length)
    set('[data-kpi="pages-per-session"] .kpi-value',
      (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1));

  if (data.length) {
    const bounces = data.filter(s => Number(s.pageview_count) === 1).length;
    set('[data-kpi="bounce"] .kpi-value', `${((bounces / data.length) * 100).toFixed(1)}%`);
  }
}

// ── Generic vertical bar chart ────────────────────────────────────────────────

function drawBarChart(canvas, tooltipEl, labels, values, title, barColor, tooltipSuffix = 'sessions') {
  const ctx = canvas.getContext('2d');
  const M = { top: 40, right: 20, bottom: 55, left: 55 };
  const W = canvas.width  - M.left - M.right;
  const H = canvas.height - M.top  - M.bottom;
  const yMax = Math.ceil(Math.max(...values, 1) * 1.2);
  const yScale = linearScale(0, yMax, M.top + H, M.top);
  const step   = W / labels.length;
  const barW   = step * 0.55;

  function draw(hi = -1) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // title
    ctx.fillStyle = '#e8eaf0'; ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(title, canvas.width / 2, 10);

    // grid + y-axis labels
    for (let i = 0; i <= 5; i++) {
      const v = (yMax / 5) * i;
      const y = yScale(v);
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
      ctx.fillStyle = i === hi ? 'rgba(185,79,247,0.9)' : barColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, bH, [4, 4, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#717a96'; ctx.font = '11px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(lbl, x + barW / 2, M.top + H + 8);
    });
  }

  draw();

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (canvas.width / rect.width);
    let   hi   = -1;
    labels.forEach((_, i) => { if (Math.abs(mx - (M.left + step * i + step / 2)) < step / 2) hi = i; });
    if (hi >= 0) {
      draw(hi);
      tooltipEl.innerHTML = `<strong>${escHtml(labels[hi])}</strong><br>${values[hi].toLocaleString()} ${tooltipSuffix}`;
      tooltipEl.style.display = 'block';

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const barCenterScreenX = (M.left + step * hi + step / 2) / scaleX;
      const barTopScreenY    = yScale(values[hi]) / scaleY;

      // Centre tooltip horizontally over the bar, float above its top
      const TOOLTIP_W = 160;
      let tooltipLeft = barCenterScreenX - TOOLTIP_W / 2;
      let tooltipTop  = barTopScreenY - 55;

      // Keep within figure bounds
      if (tooltipLeft < 0)                       tooltipLeft = 0;
      if (tooltipLeft + TOOLTIP_W > rect.width)  tooltipLeft = rect.width - TOOLTIP_W;
      if (tooltipTop < 0)                        tooltipTop  = barTopScreenY + 10;

      tooltipEl.style.left = `${tooltipLeft}px`;
      tooltipEl.style.top  = `${tooltipTop}px`;
    } else {
      tooltipEl.style.display = 'none'; draw();
    }
  });
  canvas.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; draw(); });
}

// ── Duration distribution chart ───────────────────────────────────────────────

function renderDurationChart(data) {
  const canvas  = document.getElementById('durationChart');
  const tooltip = document.getElementById('durationTooltip');
  if (!canvas) return;

  const buckets = { '0–30s': 0, '30s–2m': 0, '2–5m': 0, '5–15m': 0, '15m+': 0 };
  for (const s of data) {
    const sec = (new Date(s.session_end) - new Date(s.session_start)) / 1000;
    if (!Number.isFinite(sec) || sec < 0) continue;
    if      (sec <  30) buckets['0–30s']++;
    else if (sec < 120) buckets['30s–2m']++;
    else if (sec < 300) buckets['2–5m']++;
    else if (sec < 900) buckets['5–15m']++;
    else                buckets['15m+']++;
  }
  drawBarChart(canvas, tooltip, Object.keys(buckets), Object.values(buckets),
    'Session Duration Distribution', 'rgba(185,79,247,0.55)');
}

// ── Depth (pages/session) chart ───────────────────────────────────────────────

function renderDepthChart(data) {
  const canvas  = document.getElementById('depthChart');
  const tooltip = document.getElementById('depthTooltip');
  if (!canvas) return;

  const buckets = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
  for (const s of data) {
    const n = Number(s.pageview_count);
    if      (n === 1) buckets['1']++;
    else if (n === 2) buckets['2']++;
    else if (n === 3) buckets['3']++;
    else if (n === 4) buckets['4']++;
    else              buckets['5+']++;
  }
  drawBarChart(canvas, tooltip, Object.keys(buckets), Object.values(buckets),
    'Pages per Session', 'rgba(185,79,247,0.55)');
}

// ── Sessions table ────────────────────────────────────────────────────────────

function renderSessionsTable(data) {
  const tbody = document.querySelector('.table-section tbody');
  if (!tbody) return;

  tbody.innerHTML = data.slice(0, 50).map(s => {
    const ms  = new Date(s.session_end) - new Date(s.session_start);
    const dur = Number.isFinite(ms) && ms >= 0 ? fmtDuration(ms) : '—';
    const err = Number(s.total_errors ?? 0);
    return `
      <tr>
        <td title="${escHtml(s.session_id ?? '')}">${escHtml(String(s.session_id ?? '').slice(0, 12))}…</td>
        <td>${escHtml(s.session_start ?? '—')}</td>
        <td>${dur}</td>
        <td>${Number(s.pageview_count).toLocaleString()}</td>
        <td>${escHtml(detectDevice(s.user_agent))}</td>
        <td>${escHtml(s.language ?? '—')}</td>
        ${err > 0 ? `<td class="error-val">${err}</td>` : '<td>—</td>'}
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
    const sessions = await apiFetch('/sessions');
    const data = sessions.data ?? [];
    renderKPIs(data);
    renderDurationChart(data);
    renderDepthChart(data);
    renderSessionsTable(data);
  } catch (err) {
    console.error('[engagement]', err);
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);