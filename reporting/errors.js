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

/** Extract error.type, error.message, browser, and platform from the raw_payload JSON string. */
function parsePayload(raw) {
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
    return {
      type:     p?.error?.type     ?? '—',
      message:  p?.error?.message  ?? '—',
      browser:  p?.browser         ?? p?.userAgent?.split('/')[0] ?? '—',
      platform: p?.platform        ?? p?.os                       ?? '—',
    };
  } catch { return { type: '—', message: '—', browser: '—', platform: '—' }; }
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
  const controls = document.getElementById('trendRangeControls');
  if (!canvas) return;

  let activeRange = 30; // days; 0 = last 24 hours

  function buildBuckets(days) {
    const buckets = {};
    const now = new Date();

    if (days === 0) {
      // Hourly buckets for last 24 hours — use local time to match client_timestamp strings
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(d.getHours() - i, 0, 0, 0);
        // Build key as local "YYYY-MM-DDTHH" to match client_timestamp format
        const pad = n => String(n).padStart(2, '0');
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
        buckets[key] = 0;
      }
      for (const row of errors) {
        const ts = String(row.client_timestamp ?? '');
        const key = ts.slice(0, 13);
        if (Object.prototype.hasOwnProperty.call(buckets, key))
          buckets[key] += Number(row.error_count ?? 1);
      }
    } else {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        buckets[d.toISOString().slice(0, 10)] = 0;
      }
      for (const row of errors) {
        const day = String(row.client_timestamp ?? '').slice(0, 10);
        if (Object.prototype.hasOwnProperty.call(buckets, day))
          buckets[day] += Number(row.error_count ?? 1);
      }
    }
    return buckets;
  }

  function getDataPoints(days) {
    const buckets = buildBuckets(days);
    return Object.entries(buckets).map(([key, count]) => {
      const date = days === 0
        ? new Date(key + ':00:00')
        : new Date(key + 'T12:00:00');
      return { date, value: count, key };
    });
  }

  function formatLabel(pt, days) {
    if (days === 0) {
      return pt.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return pt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatTooltip(pt, days) {
    if (days === 0) {
      const t = pt.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `<strong>${escHtml(t)}</strong><br>${pt.value.toLocaleString()} error${pt.value !== 1 ? 's' : ''}`;
    }
    const dateStr = pt.date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
    return `<strong>${escHtml(dateStr)}</strong><br>${pt.value.toLocaleString()} error${pt.value !== 1 ? 's' : ''}`;
  }

  function getTitleLabel(days) {
    if (days === 0) return 'Hourly Errors — Last 24 Hours';
    if (days === 7)  return 'Daily Errors — Last 7 Days';
    return 'Daily Errors — Last 30 Days';
  }

  function drawChart(days) {
    const data   = getDataPoints(days);
    const ctx    = canvas.getContext('2d');
    const M      = { top: 40, right: 25, bottom: 55, left: 65 };
    const CW     = canvas.width  - M.left - M.right;
    const CH     = canvas.height - M.top  - M.bottom;
    const vals   = data.map(d => d.value);
    const yMax   = Math.ceil(Math.max(...vals, 1) / 5) * 5 || 5;
    const xScale = linearScale(0, data.length - 1, M.left, M.left + CW);
    const yScale = linearScale(0, yMax, M.top + CH, M.top);

    // Determine tick interval for x-axis based on data density
    const tickEvery = days === 0 ? 4 : (days === 7 ? 1 : 5);

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // y-axis label
      ctx.save();
      ctx.fillStyle = '#717a96';
      ctx.font = '11px Arial';
      ctx.textAlign = 'center';
      ctx.translate(14, M.top + CH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('Errors', 0, 0);
      ctx.restore();

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
        if (i % tickEvery === 0 || i === data.length - 1) {
          const x = xScale(i), y = M.top + CH;
          ctx.beginPath(); ctx.strokeStyle = 'rgb(249,249,249)'; ctx.lineWidth = 2;
          ctx.moveTo(x, y); ctx.lineTo(x, y + 6); ctx.stroke();
          ctx.fillStyle = '#717a96';
          ctx.fillText(formatLabel(pt, days), x, y + 10);
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
      grad.addColorStop(0, 'rgba(80,36,146,0.26)');
      grad.addColorStop(1, 'rgba(61,19,70,0.02)');
      ctx.fillStyle = grad; ctx.fill();

      // line
      ctx.beginPath(); ctx.strokeStyle = '#b94ff7'; ctx.lineWidth = 2.5;
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
        ctx.fillStyle = '#b94ff7'; ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
      });

      // title
      ctx.fillStyle = '#e8eaf0'; ctx.font = 'bold 14px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(getTitleLabel(days), canvas.width / 2, 10);
    }

    function highlightPoint(index) {
      const x = xScale(index), y = yScale(data[index].value);
      ctx.beginPath(); ctx.strokeStyle = 'rgba(203,191,221,0.26)'; ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(x, M.top); ctx.lineTo(x, M.top + CH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'white'; ctx.fill();
      ctx.strokeStyle = '#b94ff7'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#b94ff7'; ctx.fill();
    }

    // Remove any previous listeners attached by an earlier drawChart() call
    if (canvas._trendMoveHandler)  canvas.removeEventListener('mousemove',  canvas._trendMoveHandler);
    if (canvas._trendLeaveHandler) canvas.removeEventListener('mouseleave', canvas._trendLeaveHandler);

    canvas._trendMoveHandler = e => {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const mouseX = (e.clientX - rect.left) * scaleX;
      let ni = -1, nd = Infinity;
      data.forEach((_, i) => { const d = Math.abs(mouseX - xScale(i)); if (d < nd) { nd = d; ni = i; } });

      if (ni >= 0 && nd < 25 * scaleX) {
        const pt = data[ni];
        const px = xScale(ni) / scaleX;
        const py = yScale(pt.value) / (canvas.height / rect.height);
        render();
        highlightPoint(ni);
        tooltip.innerHTML = formatTooltip(pt, days);
        tooltip.style.display = 'block';
        let left = px + 15, top = py - 60;
        if (left + 180 > rect.width) left = px - 190;
        if (top < 0) top = py + 10;
        tooltip.style.left = `${left}px`;
        tooltip.style.top  = `${top}px`;
      } else {
        tooltip.style.display = 'none'; render();
      }
    };

    canvas._trendLeaveHandler = () => { tooltip.style.display = 'none'; render(); };

    canvas.addEventListener('mousemove',  canvas._trendMoveHandler);
    canvas.addEventListener('mouseleave', canvas._trendLeaveHandler);

    render();
  }

  // Wire up range buttons
  if (controls) {
    controls.addEventListener('click', e => {
      const btn = e.target.closest('[data-range]');
      if (!btn) return;
      controls.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = Number(btn.dataset.range);
      drawChart(activeRange);
    });
  }

  drawChart(activeRange);
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
  const M      = { top: 40, right: 20, bottom: 55, left: 65 };
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

    // y-axis label
    ctx.save();
    ctx.fillStyle = '#717a96';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.translate(14, M.top + H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Errors', 0, 0);
    ctx.restore();

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
      ctx.fillStyle = i === hi ? 'rgba(185,79,247,0.9)' : 'rgba(185,79,247,0.55)';
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

// ── Errors by Browser chart ───────────────────────────────────────────────────

function renderBrowserChart(errors) {
  const canvas  = document.getElementById('browserChart');
  const tooltip = document.getElementById('browserTooltip');
  if (!canvas) return;

  const COLORS = [
    '#b94ff7', '#7c5cbf', '#4f8ef7', '#f7a24f', '#4fd1f7',
    '#f74f7a', '#a8f74f', '#f7e24f'
  ];

  const browserMap = new Map();
  for (const row of errors) {
    const { browser } = parsePayload(row.raw_payload);
    // Normalize common browser names
    let b = String(browser ?? '—');
    if (/chrome/i.test(b) && !/edge|opr/i.test(b)) b = 'Chrome';
    else if (/firefox/i.test(b)) b = 'Firefox';
    else if (/safari/i.test(b) && !/chrome/i.test(b)) b = 'Safari';
    else if (/edge/i.test(b)) b = 'Edge';
    else if (/opr|opera/i.test(b)) b = 'Opera';
    else if (b === '—') b = 'Unknown';
    browserMap.set(b, (browserMap.get(b) ?? 0) + Number(row.error_count ?? 1));
  }

  const sorted = [...browserMap.entries()].sort((a, b) => b[1] - a[1]);
  const total  = sorted.reduce((s, [, v]) => s + v, 0);

  if (!sorted.length || total === 0) {
    // Show fallback
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#717a96'; ctx.font = '13px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No browser data available', canvas.width / 2, canvas.height / 2);
    return;
  }

  const ctx = canvas.getContext('2d');
  const cx  = canvas.width / 2;
  const cy  = canvas.height / 2 + 10;
  const R   = Math.min(canvas.width, canvas.height) * 0.32;
  const r   = R * 0.52;

  function draw(hi = -1) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // title
    ctx.fillStyle = '#e8eaf0'; ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('Errors by Browser', canvas.width / 2, 10);

    let startAngle = -Math.PI / 2;
    sorted.forEach(([name, val], i) => {
      const slice  = (val / total) * 2 * Math.PI;
      const color  = COLORS[i % COLORS.length];
      const isHi   = i === hi;
      const outerR = isHi ? R + 6 : R;

      // Arc from outer radius down to inner radius (counter-clockwise) — no
      // explicit moveTo connecting line, so no stray stroke across the hole.
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
      ctx.arc(cx, cy, r, startAngle + slice, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = isHi ? color : color + 'aa';
      ctx.fill();

      startAngle += slice;
    });

    // Center text
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total.toLocaleString(), cx, cy - 8);
    ctx.font = '11px Arial';
    ctx.fillStyle = '#717a96';
    ctx.fillText('total errors', cx, cy + 10);

    // Legend
    const legendX = 10;
    const legendAreaHeight = sorted.length * 18 + 5;
    let legendY = Math.max(50, canvas.height - legendAreaHeight);
    sorted.forEach(([name, val], i) => {
      const pct = ((val / total) * 100).toFixed(1);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(legendX, legendY, 10, 10);
      ctx.fillStyle = '#c0c8e0';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${name} (${pct}%)`, legendX + 14, legendY + 5);
      legendY += 18;
    });
  }

  draw();

  // Hover detection
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width) - cx;
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height) - cy;
    const dist = Math.sqrt(mx * mx + my * my);
    let hi = -1;

    if (dist >= r && dist <= R) {
      // Use raw angle from unshifted center for hit detection (offset only affects rendering)
      let angle = Math.atan2(my, mx) + Math.PI / 2;
      if (angle < 0) angle += 2 * Math.PI;
      if (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
      let cumulative = 0;
      sorted.forEach(([, val], i) => {
        const slice = (val / total) * 2 * Math.PI;
        if (angle >= cumulative && angle < cumulative + slice) hi = i;
        cumulative += slice;
      });
    }

    if (hi >= 0) {
      draw(hi);
      const [name, val] = sorted[hi];
      const pct = ((val / total) * 100).toFixed(1);
      tooltip.innerHTML = `<strong>${escHtml(name)}</strong><br>${val.toLocaleString()} errors (${pct}%)`;
      tooltip.style.display = 'block';
      const px = (e.clientX - rect.left);
      const py = (e.clientY - rect.top);
      tooltip.style.left = `${px + 12}px`;
      tooltip.style.top  = `${py - 40}px`;
    } else {
      tooltip.style.display = 'none';
      draw();
    }
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; draw(); });
}

// ── Errors by Platform chart ──────────────────────────────────────────────────

function renderPlatformChart(errors) {
  const canvas  = document.getElementById('platformChart');
  const tooltip = document.getElementById('platformTooltip');
  if (!canvas) return;

  const COLORS = ['#4f8ef7', '#b94ff7', '#f7a24f', '#4fd1f7', '#f74f7a', '#a8f74f'];

  const platMap = new Map();
  for (const row of errors) {
    const { platform } = parsePayload(row.raw_payload);
    let p = String(platform ?? '—');
    if (/windows/i.test(p))    p = 'Windows';
    else if (/mac|osx/i.test(p)) p = 'macOS';
    else if (/linux/i.test(p)) p = 'Linux';
    else if (/android/i.test(p)) p = 'Android';
    else if (/ios|iphone|ipad/i.test(p)) p = 'iOS';
    else if (p === '—') p = 'Unknown';
    platMap.set(p, (platMap.get(p) ?? 0) + Number(row.error_count ?? 1));
  }

  const sorted = [...platMap.entries()].sort((a, b) => b[1] - a[1]);
  const total  = sorted.reduce((s, [, v]) => s + v, 0);

  if (!sorted.length || total === 0) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#717a96'; ctx.font = '13px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No platform data available', canvas.width / 2, canvas.height / 2);
    return;
  }

  const ctx = canvas.getContext('2d');
  const M   = { top: 40, right: 20, bottom: 20, left: 90 };
  const W   = canvas.width  - M.left - M.right;
  const H   = canvas.height - M.top  - M.bottom;
  const barH = Math.min(28, (H / sorted.length) * 0.65);
  const rowH  = H / sorted.length;

  function draw(hi = -1) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // title
    ctx.fillStyle = '#e8eaf0'; ctx.font = 'bold 14px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('Errors by Platform', canvas.width / 2, 10);

    const xMax = sorted[0][1] * 1.15;
    const xScale = linearScale(0, xMax, M.left, M.left + W);

    sorted.forEach(([name, val], i) => {
      const color = COLORS[i % COLORS.length];
      const bW    = xScale(val) - M.left;
      const y     = M.top + i * rowH + (rowH - barH) / 2;
      const isHi  = i === hi;

      // bar
      ctx.fillStyle = isHi ? color : color + 'bb';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(M.left, y, bW, barH, [0, 4, 4, 0]);
      else ctx.rect(M.left, y, bW, barH);
      ctx.fill();

      // label
      ctx.fillStyle = '#c0c8e0'; ctx.font = '12px Arial';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(name, M.left - 6, y + barH / 2);

      // value
      ctx.fillStyle = isHi ? '#e8eaf0' : '#717a96';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(val.toLocaleString(), M.left + bW + 6, y + barH / 2);
    });
  }

  draw();

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const my   = (e.clientY - rect.top) * (canvas.height / rect.height);
    let hi = -1;
    sorted.forEach((_, i) => {
      const y = M.top + i * rowH;
      if (my >= y && my < y + rowH) hi = i;
    });
    if (hi >= 0) {
      draw(hi);
      const [name, val] = sorted[hi];
      const pct = ((val / total) * 100).toFixed(1);
      tooltip.innerHTML = `<strong>${escHtml(name)}</strong><br>${val.toLocaleString()} errors (${pct}%)`;
      tooltip.style.display = 'block';
      const px = (e.clientX - rect.left);
      const py = (e.clientY - rect.top);
      tooltip.style.left = `${px + 12}px`;
      tooltip.style.top  = `${py - 40}px`;
    } else {
      tooltip.style.display = 'none'; draw();
    }
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; draw(); });
}

// ── Recent error log — compact summary ───────────────────────────────────────

function renderErrorLog(errors) {
  const container = document.getElementById('error-log-container');
  if (!container) return;

  // Group by (type, page) and summarise
  const groups = new Map();
  for (const row of errors) {
    const { type, message } = parsePayload(row.raw_payload);
    const page = pathname(row.url ?? '');
    const key  = `${type}||${page}`;
    if (!groups.has(key)) {
      groups.set(key, { type, page, url: row.url, message, count: 0, lastSeen: '' });
    }
    const g = groups.get(key);
    g.count += Number(row.error_count ?? 1);
    const ts = String(row.client_timestamp ?? '');
    if (!g.lastSeen || ts > g.lastSeen) g.lastSeen = ts;
  }

  const sorted = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  if (!sorted.length) {
    container.innerHTML = '<p class="empty-state">No errors recorded.</p>';
    return;
  }

  const typeColors = {
    TypeError:      '#f74f7a',
    ReferenceError: '#f7a24f',
    SyntaxError:    '#f7e24f',
    NetworkError:   '#4f8ef7',
    RangeError:     '#a8f74f',
    '—':            '#717a96',
  };

  function badgeColor(type) {
    return typeColors[type] ?? '#b94ff7';
  }

  const rows = sorted.map(g => {
    const last = g.lastSeen
      ? new Date(g.lastSeen).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
      : '—';
    const shortMsg = String(g.message).slice(0, 70) + (String(g.message).length > 70 ? '…' : '');
    const color = badgeColor(g.type);
    return `
      <div class="error-log-row">
        <span class="error-badge" style="background:${color}22;color:${color};border:1px solid ${color}55">${escHtml(g.type)}</span>
        <span class="error-log-page"><a href="${escHtml(g.url ?? '')}" title="${escHtml(g.url ?? '')}">${escHtml(g.page || '/')}</a></span>
        <span class="error-log-msg" title="${escHtml(String(g.message))}">${escHtml(shortMsg)}</span>
        <span class="error-log-count">${g.count.toLocaleString()}×</span>
        <span class="error-log-time">${escHtml(last)}</span>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}

// ── Top pages by error count table ────────────────────────────────────────────

function renderTopPagesTable(errors) {
  const tbody = document.getElementById('topPagesTableBody');
  if (!tbody) return;

  // Aggregate per URL: total count, dominant error type, last seen
  const urlMap = new Map();
  for (const row of errors) {
    const url = row.url ?? '(unknown)';
    if (!urlMap.has(url)) urlMap.set(url, { count: 0, last: '', types: new Map() });
    const entry = urlMap.get(url);
    entry.count += Number(row.error_count ?? 1);
    if (!entry.last || (row.client_timestamp ?? '') > entry.last)
      entry.last = row.client_timestamp ?? '';
    const { type } = parsePayload(row.raw_payload);
    entry.types.set(type, (entry.types.get(type) ?? 0) + Number(row.error_count ?? 1));
  }

  const sorted = [...urlMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15);

  tbody.innerHTML = sorted.map(([url, s], i) => {
    const path = pathname(url);
    const last = s.last
      ? new Date(s.last).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
      : '—';
    const dominantType = [...s.types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    return `
      <tr>
        <td>${i + 1}</td>
        <td><a href="${escHtml(url)}" title="${escHtml(url)}">${escHtml(path)}</a></td>
        <td class="error-val">${s.count.toLocaleString()}</td>
        <td><span class="error-type-pill">${escHtml(dominantType)}</span></td>
        <td>${escHtml(last)}</td>
      </tr>`;
  }).join('');
}

// ── Recommended Actions panel ─────────────────────────────────────────────────

function renderRecommendations(errors) {
  const container = document.getElementById('recommendations-list');
  if (!container) return;

  // ── Per-page recommendations ──────────────────────────────
  const urlMap = new Map();
  for (const row of errors) {
    const url = row.url ?? '(unknown)';
    if (!urlMap.has(url)) urlMap.set(url, { count: 0, types: new Map() });
    const entry = urlMap.get(url);
    entry.count += Number(row.error_count ?? 1);
    const { type } = parsePayload(row.raw_payload);
    entry.types.set(type, (entry.types.get(type) ?? 0) + Number(row.error_count ?? 1));
  }

  const sorted = [...urlMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const total  = errors.reduce((s, r) => s + Number(r.error_count ?? 1), 0);

  if (!sorted.length) {
    container.innerHTML = '<li class="rec-item rec-loading">No error data available for recommendations.</li>';
    return;
  }

  const PRIORITY_ICONS = ['🔴', '🟠', '🟡', '🟡', '🟢'];

  const pageItems = sorted.map(([url, s], i) => {
    const path = pathname(url) || '/';
    const pct  = total > 0 ? ((s.count / total) * 100).toFixed(0) : 0;

    // All error types on this page, sorted by frequency
    const typeList = [...s.types.entries()].sort((a, b) => b[1] - a[1]);
    const dominantType  = typeList[0]?.[0] ?? '—';
    const dominantCount = typeList[0]?.[1] ?? 0;

    // Build a specific, multi-error-type hint
    const hints = [];

    for (const [type, count] of typeList) {
      const share = s.count > 0 ? Math.round((count / s.count) * 100) : 0;
      if (type === 'TypeError')
        hints.push(`${share}% are TypeErrors — audit ${escHtml(path)} for unchecked null/undefined values, especially after async data fetches or DOM lookups that may return null.`);
      else if (type === 'ReferenceError')
        hints.push(`${share}% are ReferenceErrors — a variable or function used on ${escHtml(path)} may be out of scope or loaded out of order; check script load sequence.`);
      else if (type === 'SyntaxError')
        hints.push(`${share}% are SyntaxErrors — likely a malformed JS bundle served to ${escHtml(path)}; compare against the last successful deployment.`);
      else if (type === 'NetworkError')
        hints.push(`${share}% are NetworkErrors — ${escHtml(path)} has failing resource requests; verify API endpoints, CORS headers, and CDN availability.`);
      else if (type === 'RangeError')
        hints.push(`${share}% are RangeErrors — a value on ${escHtml(path)} exceeds an allowed range (e.g. invalid array length or recursion depth).`);
      else if (type !== '—')
        hints.push(`${share}% are ${escHtml(type)} — review recent changes to ${escHtml(path)}.`);
    }

    const hintText = hints.length
      ? hints.join(' ')
      : `Investigate recent changes to ${escHtml(path)}.`;

    return `
      <li class="rec-item">
        <span class="rec-priority">${PRIORITY_ICONS[i]}</span>
        <div class="rec-body">
          <strong class="rec-page">${escHtml(path)}</strong>
          <span class="rec-meta">${s.count.toLocaleString()} errors · ${pct}% of total · Dominant: <em>${escHtml(dominantType)}</em></span>
          <p class="rec-hint">${hintText}</p>
        </div>
      </li>`;
  });

  // ── Browser breakdown recommendation ─────────────────────
  const browserMap = new Map();
  for (const row of errors) {
    const { browser } = parsePayload(row.raw_payload);
    let b = String(browser ?? '—');
    if (/chrome/i.test(b) && !/edge|opr/i.test(b)) b = 'Chrome';
    else if (/firefox/i.test(b)) b = 'Firefox';
    else if (/safari/i.test(b) && !/chrome/i.test(b)) b = 'Safari';
    else if (/edge/i.test(b)) b = 'Edge';
    else if (/opr|opera/i.test(b)) b = 'Opera';
    else b = 'Unknown';
    browserMap.set(b, (browserMap.get(b) ?? 0) + Number(row.error_count ?? 1));
  }

  const browsersSorted = [...browserMap.entries()].sort((a, b) => b[1] - a[1]);
  const allUnknown = browsersSorted.length === 0 ||
    (browsersSorted.length === 1 && browsersSorted[0][0] === 'Unknown');

  let browserItem;
  if (allUnknown) {
    // Collection gap — all browsers are unknown
    browserItem = `
      <li class="rec-item rec-item--warning">
        <span class="rec-priority">⚠️</span>
        <div class="rec-body">
          <strong class="rec-page">Fix: Browser &amp; OS data not being collected</strong>
          <span class="rec-meta rec-meta--warning">All errors report Unknown browser — client-side collection gap</span>
          <p class="rec-hint">
            The error beacon is not capturing <code>navigator.userAgent</code> or a parsed browser/OS field.
            Without this, it is impossible to determine whether errors are browser-specific (e.g. a Safari
            CSS bug, an Edge compatibility issue) or platform-specific (mobile vs. desktop).
            Add <code>userAgent: navigator.userAgent</code> to the payload sent via
            <code>navigator.sendBeacon()</code> on both the <code>error</code> and
            <code>unhandledrejection</code> listeners, then parse it server-side into
            <code>browser</code> and <code>platform</code> fields before storing.
          </p>
        </div>
      </li>`;
  } else {
    // We have real browser data — surface the top offending browser
    const topBrowser = browsersSorted[0][0];
    const topCount   = browsersSorted[0][1];
    const topPct     = total > 0 ? ((topCount / total) * 100).toFixed(0) : 0;
    const browserHint = topBrowser === 'Safari' ? 'Safari has stricter third-party cookie and IndexedDB policies; check for storage-access errors.'
                      : topBrowser === 'Firefox' ? 'Verify CSP headers and mixed-content rules, which Firefox enforces more strictly.'
                      : topBrowser === 'Edge'    ? 'Check for IE-compatibility mode being triggered on older enterprise machines.'
                      : `Audit recent JS changes for APIs not yet supported in ${escHtml(topBrowser)}.`;
    browserItem = `
      <li class="rec-item">
        <span class="rec-priority">🌐</span>
        <div class="rec-body">
          <strong class="rec-page">Browser focus: ${escHtml(topBrowser)}</strong>
          <span class="rec-meta">${topCount.toLocaleString()} errors (${topPct}% of total) originate from ${escHtml(topBrowser)}</span>
          <p class="rec-hint">${browserHint} Cross-browser test fixes in ${escHtml(topBrowser)} before rolling out.</p>
        </div>
      </li>`;
  }

  container.innerHTML = [...pageItems, browserItem].join('');
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
    renderBrowserChart(errors);
    renderPlatformChart(errors);
    renderErrorLog(errors);
    renderTopPagesTable(errors);
    renderRecommendations(errors);
  } catch (err) {
    console.error('[errors]', err);
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', init);