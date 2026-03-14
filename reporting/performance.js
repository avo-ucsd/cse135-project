'use strict';

const BASE = '/api';

//  Global filter state 
const filters = { days: 1, page: 'all' };
let vitalsPage = 'all';

const VITAL_THRESHOLDS = {
    LCP: { good: 2500, poor: 4000 },
    INP: { good: 200, poor: 500 },
    CLS: { good: 0.1, poor: 0.25 },
};

const VITAL_WEIGHTS = { LCP: 1, INP: 1, CLS: 1 };
const LONG_TASK_THRESHOLD_MS = 50;

//  Cached API data (fetched once, re-filtered on every refresh) 
let cachedRows        = [];
let cachedSessionData = [];
let cachedVitals      = [];
let cachedTechno      = [];
let cachedErrors      = [];

//  AbortControllers for chart mouse listeners 
let trendAbort       = null;
let sparklineAbortMap = new Map();

const liveLongTask = {
    supported: false,
    count: 0,
    totalBlockingMs: 0,
    maxDurationMs: 0,
};

//  API helper 

async function apiFetch(path) {
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error(`API ${path} -> HTTP ${res.status}`);
    const ct = res.headers.get('Content-Type') ?? '';
    if (!ct.includes('application/json')) {
        throw new Error(`Unexpected Content-Type "${ct}" for ${path}`);
    }
    return res.json();
}

//  Utilities 

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtDuration(ms) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
}

function fmtMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return '-';
    if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
    return Math.round(ms) + 'ms';
}

function formatBytes(bytes) {
    if (bytes > 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB';
    if (bytes > 1_000) return Math.round(bytes / 1_000) + ' KB';
    return bytes + ' B';
}

function pathname(url) {
    try { return new URL(url).pathname; } catch { return url; }
}

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

function p75(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.75)];
}

function percentile(arr, p) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx];
}

function normalizeRatingLabel(value) {
    const rating = String(value ?? '').trim().toLowerCase();
    if (rating === 'good') return 'good';
    if (rating === 'poor') return 'poor';
    if (rating === 'needs-improvement' || rating === 'needs improvement') return 'needs-improvement';
    return null;
}

function buildRatingSummary(vitalsData, field) {
    const summary = { good: 0, needsImprovement: 0, poor: 0, known: 0 };

    for (const row of vitalsData) {
        const normalized = normalizeRatingLabel(row[field]);
        if (!normalized) continue;
        summary.known++;
        if (normalized === 'good') summary.good++;
        if (normalized === 'needs-improvement') summary.needsImprovement++;
        if (normalized === 'poor') summary.poor++;
    }

    return summary;
}

function formatRatingSummary(summary) {
    if (!summary || summary.known <= 0) return '';
    return ` · G ${summary.good} / NI ${summary.needsImprovement} / P ${summary.poor}`;
}

function getLongTaskMetricsFromRow(row) {
    const directCount = Number(row.longtask_count);
    const directBlocking = Number(row.longtask_total_blocking_ms);
    const directMax = Number(row.longtask_max_duration_ms);

    if (Number.isFinite(directCount) || Number.isFinite(directBlocking) || Number.isFinite(directMax)) {
        return {
            count: Number.isFinite(directCount) ? directCount : 0,
            blockingMs: Number.isFinite(directBlocking) ? directBlocking : 0,
            maxDurationMs: Number.isFinite(directMax) ? directMax : 0,
            source: 'columns',
        };
    }

    if (typeof row.raw_payload !== 'string' || !row.raw_payload.trim()) {
        return { count: 0, blockingMs: 0, maxDurationMs: 0, source: null };
    }

    try {
        const payload = JSON.parse(row.raw_payload);
        const lt = payload?.longTasks;
        if (!lt || typeof lt !== 'object') {
            return { count: 0, blockingMs: 0, maxDurationMs: 0, source: null };
        }

        return {
            count: Number.isFinite(Number(lt.count)) ? Number(lt.count) : 0,
            blockingMs: Number.isFinite(Number(lt.totalBlockingMs)) ? Number(lt.totalBlockingMs) : 0,
            maxDurationMs: Number.isFinite(Number(lt.maxDurationMs)) ? Number(lt.maxDurationMs) : 0,
            source: 'raw_payload',
        };
    } catch {
        return { count: 0, blockingMs: 0, maxDurationMs: 0, source: null };
    }
}

//  Error banner 

function showError(msg) {
    const banner = document.createElement('p');
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
        'background:#f87171;color:#0f1117;padding:0.75rem 1.25rem;border-radius:8px;margin:1rem;font-weight:600';
    banner.textContent = `Performance data failed to load: ${msg}`;
    document.querySelector('main')?.prepend(banner);
}

//  Filter helpers 

function cutoffMs() {
    return Date.now() - filters.days * 24 * 60 * 60 * 1000;
}

function getFilteredRows(rows) {
    const co = cutoffMs();
    return rows.filter(row => {
        const ts = new Date(row.received_at ?? row.page_entered_at).getTime();
        const inTime = !isNaN(ts) ? ts >= co : true;
        const inPage = filters.page === 'all' || row.url === filters.page;
        return inTime && inPage;
    });
}

function getFilteredSessionData(sessionData) {
    const co = cutoffMs();
    return sessionData.filter(s => {
        const ts = new Date(s.session_start).getTime();
        return !isNaN(ts) ? ts >= co : true;
    });
}

function getFilteredVitals(vitals) {
    const co = cutoffMs();
    return vitals.filter(v => {
        const ts = new Date(v.client_timestamp).getTime();
        const inTime = !isNaN(ts) ? ts >= co : true;
        const inPage = filters.page === 'all' || v.url === filters.page;
        return inTime && inPage;
    });
}

function getTimeFilteredVitals(vitals) {
    const co = cutoffMs();
    return vitals.filter(v => {
        const ts = new Date(v.client_timestamp).getTime();
        return !isNaN(ts) ? ts >= co : true;
    });
}

function getFilteredTechno(techno) {
    const co = cutoffMs();
    return techno.filter(t => {
        const ts = new Date(t.client_timestamp).getTime();
        return !isNaN(ts) ? ts >= co : true;
    });
}

//  Aggregate builder 

function buildAggregates(rows, sessionData) {
    const urlMap = new Map();

    for (const row of rows) {
        if (row.event_type === 'error') continue;
        const url = row.url ?? '(unknown)';
        if (!urlMap.has(url)) {
            urlMap.set(url, {
                url,
                views:          0,
                sessions:       new Set(),
                totalDuration:  0,
                durationCount:  0,
                errors:         0,
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

    const bounceSessions = new Set(
        sessionData
            .filter(s => Number(s.pageview_count) === 1)
            .map(s => s.session_id)
    );

    return { urlMap, bounceSessions };
}

//  Tier 1: Core Web Vitals 

function renderSparkline(name, history) {
    const canvas = document.querySelector(`[data-spark="${name}"]`);
    const values = history.map(point =>
        typeof point === 'number' ? point : Number(point.value)
    );
    if (!canvas || values.length < 2) {
        clearSparkline(name);
        return;
    }
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const xStep = w / (history.length - 1);
    const yScale = max > min ? (v) => h - ((v - min) / (max - min)) * (h - 4) - 2 : () => h / 2;

    ctx.beginPath();
    ctx.strokeStyle = '#b94ff7';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    values.forEach((v, i) => {
        const x = i * xStep;
        const y = yScale(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    bindSparklineTooltip(name, history, xStep);
}

function clearSparkline(name) {
    const canvas = document.querySelector(`[data-spark="${name}"]`);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const tooltipEl = document.querySelector(`[data-vital-tooltip="${name}"]`);
    if (tooltipEl) tooltipEl.style.display = 'none';

    const controller = sparklineAbortMap.get(name);
    if (controller) controller.abort();
    sparklineAbortMap.delete(name);
}

function formatVitalValue(name, value) {
    if (name === 'CLS') return Number(value).toFixed(3);
    return fmtMs(value);
}

function getVitalStatSelection() {
    const statSel = document.getElementById('vital-stat-select');
    const statKey = statSel?.value ?? 'p75';
    const statLabel = statKey.toUpperCase();
    const statP = statKey === 'p50' ? 0.5 : statKey === 'p90' ? 0.9 : 0.75;
    return { statKey, statLabel, statP };
}

function bindSparklineTooltip(name, series, xStep) {
    const canvas = document.querySelector(`[data-spark="${name}"]`);
    const tooltipEl = document.querySelector(`[data-vital-tooltip="${name}"]`);
    if (!canvas || !tooltipEl || series.length < 2) return;

    const prior = sparklineAbortMap.get(name);
    if (prior) prior.abort();
    const controller = new AbortController();
    sparklineAbortMap.set(name, controller);

    canvas.addEventListener('mousemove', e => {
        const rect   = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / rect.width;
        const mx     = (e.clientX - rect.left) * scaleX;

        const idx = Math.round(mx / xStep);
        if (idx < 0 || idx >= series.length) {
            tooltipEl.style.display = 'none';
            return;
        }

        const point = series[idx];
        const value = typeof point === 'number' ? point : point.value;
        const ts    = typeof point === 'number' ? null : point.ts;
        const date  = ts ? new Date(ts) : null;
        const dateStr = date && !isNaN(date)
            ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
              ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : 'Current load';

        tooltipEl.innerHTML =
            `<strong>${escHtml(formatVitalValue(name, value))}</strong><br>` +
            `${escHtml(dateStr)}`;
        tooltipEl.style.display = 'block';

        const TOOLTIP_W = 160;
        const baseLeft = (mx / scaleX) + 10;
        const baseTop  = canvas.offsetTop + canvas.offsetHeight + 8;
        let tLeft = baseLeft;
        if (tLeft + TOOLTIP_W > canvas.offsetParent.clientWidth) {
            tLeft = (mx / scaleX) - TOOLTIP_W - 10;
        }
        if (tLeft < 0) tLeft = 0;
        let tTop = baseTop;
        tooltipEl.style.left = `${tLeft}px`;
        tooltipEl.style.top  = `${tTop}px`;
    }, { signal: controller.signal });

    canvas.addEventListener('mouseleave', () => {
        tooltipEl.style.display = 'none';
    }, { signal: controller.signal });
}

function setVitalMeta(name, samples) {
    const card = document.querySelector(`[data-vital="${name}"]`);
    if (!card) return;
    const samplesEl = card.querySelector('[data-vital-samples]');
    if (samplesEl) samplesEl.textContent = `Samples: ${samples.toLocaleString()}`;
}

function setVitalEmpty(name, message) {
    const card = document.querySelector(`[data-vital="${name}"]`);
    if (!card) return;
    card.className = 'vital-card empty';
    const valueEl = card.querySelector('.vital-value');
    const statusEl = card.querySelector('.vital-status');
    if (valueEl) valueEl.textContent = '—';
    if (statusEl) statusEl.textContent = message;
    clearSparkline(name);
}

function buildSparklineSeries(vitalsData, field, maxPoints = 10) {
    const rows = vitalsData
        .map(v => ({ value: Number(v[field]), ts: v.client_timestamp }))
        .filter(v => v.value > 0 && v.ts)
        .sort((a, b) => new Date(a.ts) - new Date(b.ts));

    if (rows.length <= maxPoints) return rows;

    const step = (rows.length - 1) / (maxPoints - 1);
    const series = [];
    for (let i = 0; i < maxPoints; i++) {
        series.push(rows[Math.round(i * step)]);
    }
    return series;
}

function renderVital(name, value, goodThreshold, poorThreshold, source, history) {
    const card = document.querySelector(`[data-vital="${name}"]`);
    if (!card) return;

    const isCls = name === 'CLS';
    const displayVal = isCls ? Number(value).toFixed(3) : Math.round(value);
    const status = value <= goodThreshold ? 'good'
                 : value <= poorThreshold ? 'warn'
                 : 'bad';
    const statusText = status === 'good' ? 'GOOD'
                     : status === 'warn' ? 'NEEDS WORK'
                     : 'POOR';

    card.querySelector('.vital-value').textContent = displayVal;
    card.className = `vital-card ${status}`;
    card.querySelector('.vital-status').textContent =
        source ? `${statusText} · ${escHtml(source)}` : statusText;

    if (Array.isArray(history) && history.length >= 2) {
        renderSparkline(name, history);
    }
}

function renderVitalsFromApiData(vitalsData) {
    if (!vitalsData.length) {
        ['LCP', 'CLS', 'INP'].forEach(name => {
            setVitalMeta(name, 0);
            setVitalEmpty(name, 'No data in range');
        });
        return;
    }

    const { statLabel, statP } = getVitalStatSelection();

    const lcpVals = vitalsData.map(v => Number(v.vital_lcp)).filter(v => v > 0);
    const clsVals = vitalsData.map(v => Number(v.vital_cls)).filter(v => v >= 0 && !isNaN(v));
    const inpVals = vitalsData.map(v => Number(v.vital_inp)).filter(v => v > 0);

    const lcpStat = percentile(lcpVals, statP);
    const clsStat = percentile(clsVals, statP);
    const inpStat = percentile(inpVals, statP);

    const lcpSeries = buildSparklineSeries(vitalsData, 'vital_lcp');
    const clsSeries = buildSparklineSeries(vitalsData, 'vital_cls');
    const inpSeries = buildSparklineSeries(vitalsData, 'vital_inp');
    const lcpRatings = buildRatingSummary(vitalsData, 'webvitals_rating_lcp');
    const clsRatings = buildRatingSummary(vitalsData, 'webvitals_rating_cls');
    const inpRatings = buildRatingSummary(vitalsData, 'webvitals_rating_inp');

    if (lcpStat != null) {
        setVitalMeta('LCP', lcpVals.length);
        renderVital('LCP', lcpStat, 2500, 4000, `${statLabel} · ${lcpVals.length} samples${formatRatingSummary(lcpRatings)}`, lcpSeries);
    } else {
        setVitalMeta('LCP', 0);
        setVitalEmpty('LCP', 'No data in range');
    }

    if (clsStat != null) {
        setVitalMeta('CLS', clsVals.length);
        renderVital('CLS', clsStat, 0.1, 0.25, `${statLabel} · ${clsVals.length} samples${formatRatingSummary(clsRatings)}`, clsSeries);
    } else {
        setVitalMeta('CLS', 0);
        setVitalEmpty('CLS', 'No data in range');
    }

    if (inpStat != null) {
        setVitalMeta('INP', inpVals.length);
        renderVital('INP', inpStat, 200, 500, `${statLabel} · ${inpVals.length} samples${formatRatingSummary(inpRatings)}`, inpSeries);
    } else {
        setVitalMeta('INP', 0);
        setVitalEmpty('INP', 'No data in range');
    }
}

function normalizeVitalScore(value, goodThreshold, poorThreshold) {
    if (value == null || !Number.isFinite(value)) return null;
    if (value <= goodThreshold) return 0;
    if (value >= poorThreshold) return 1;
    return (value - goodThreshold) / (poorThreshold - goodThreshold);
}

function computeCompositeScore({ lcpStat, inpStat, clsStat }) {
    const parts = [
        { key: 'LCP', value: lcpStat },
        { key: 'INP', value: inpStat },
        { key: 'CLS', value: clsStat },
    ];

    let total = 0;
    let weightSum = 0;
    for (const part of parts) {
        const thresholds = VITAL_THRESHOLDS[part.key];
        if (!thresholds) continue;
        const normalized = normalizeVitalScore(part.value, thresholds.good, thresholds.poor);
        if (normalized == null) continue;
        const weight = VITAL_WEIGHTS[part.key] ?? 1;
        total += normalized * weight;
        weightSum += weight;
    }

    return weightSum > 0 ? total / weightSum : null;
}

function buildVitalsPageStats(vitalsData) {
    const { statP } = getVitalStatSelection();
    const map = new Map();

    for (const v of vitalsData) {
        const url = v.url ?? '(unknown)';
        if (!map.has(url)) {
            map.set(url, {
                url,
                rows: [],
                lcpVals: [],
                inpVals: [],
                clsVals: [],
            });
        }
        const entry = map.get(url);
        entry.rows.push(v);

        const lcp = Number(v.vital_lcp);
        const inp = Number(v.vital_inp);
        const cls = Number(v.vital_cls);

        if (lcp > 0) entry.lcpVals.push(lcp);
        if (inp > 0) entry.inpVals.push(inp);
        if (cls >= 0 && !isNaN(cls)) entry.clsVals.push(cls);
    }

    const entries = [];
    for (const entry of map.values()) {
        const lcpStat = percentile(entry.lcpVals, statP);
        const inpStat = percentile(entry.inpVals, statP);
        const clsStat = percentile(entry.clsVals, statP);

        entries.push({
            url: entry.url,
            samples: entry.rows.length,
            lcpStat,
            inpStat,
            clsStat,
            lcpSeries: buildSparklineSeries(entry.rows, 'vital_lcp'),
            inpSeries: buildSparklineSeries(entry.rows, 'vital_inp'),
            clsSeries: buildSparklineSeries(entry.rows, 'vital_cls'),
            score: computeCompositeScore({ lcpStat, inpStat, clsStat }),
        });
    }

    return entries;
}

function getVitalsForPage(vitalsData, page) {
    if (!page || page === 'all') return vitalsData;
    return vitalsData.filter(v => v.url === page);
}

function populateVitalsPageSelect(entries) {
    const sel = document.getElementById('vitals-page-select');
    if (!sel) return;
    const current = vitalsPage;
    while (sel.options.length > 1) sel.remove(1);

    const sorted = [...entries].sort((a, b) => {
        const aScore = a.score ?? -1;
        const bScore = b.score ?? -1;
        return bScore - aScore || (b.samples - a.samples);
    });

    for (const entry of sorted) {
        const opt = document.createElement('option');
        opt.value = entry.url;
        opt.textContent = pathname(entry.url);
        if (opt.value === current) opt.selected = true;
        sel.appendChild(opt);
    }
}

function updateVitalsRowSelection(tbody, page) {
    tbody.querySelectorAll('tr').forEach(row => {
        const isSelected = row.dataset.page === page;
        row.classList.toggle('is-selected', isSelected);
    });
}

function renderVitalsWorstTable(entries, vitalsData) {
    const tbody = document.getElementById('vitals-worst-tbody');
    if (!tbody) return;

    const scored = entries.filter(entry => entry.score != null);
    const top = scored
        .sort((a, b) => (b.score - a.score) || (b.samples - a.samples))
        .slice(0, 5);

    if (top.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="null-val" style="text-align:center">No Core Web Vitals data in the selected time range</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    top.forEach((entry, i) => {
        const scorePct = entry.score != null ? (entry.score * 100) : null;
        const scoreText = scorePct != null ? scorePct.toFixed(1) : '-';
        const scoreCls = scorePct == null ? 'null-val'
            : scorePct >= 67 ? 'error-val'
            : scorePct >= 34 ? 'warn-val'
            : 'good-val';

        const tr = document.createElement('tr');
        tr.dataset.page = entry.url;
        if (entry.url === vitalsPage) tr.classList.add('is-selected');

        const tdRank = document.createElement('td');
        tdRank.textContent = i + 1;
        tdRank.style.color = 'var(--text-muted)';
        tr.appendChild(tdRank);

        const tdPage = document.createElement('td');
        tdPage.dataset.col = 'page';
        tdPage.textContent = pathname(entry.url);
        tdPage.title = entry.url;
        tr.appendChild(tdPage);

        const tdScore = document.createElement('td');
        tdScore.className = scoreCls;
        tdScore.textContent = scoreText;
        tr.appendChild(tdScore);

        const tdLcp = document.createElement('td');
        tdLcp.textContent = entry.lcpStat != null ? formatVitalValue('LCP', entry.lcpStat) : '-';
        if (entry.lcpStat == null) tdLcp.className = 'null-val';
        tr.appendChild(tdLcp);

        const tdInp = document.createElement('td');
        tdInp.textContent = entry.inpStat != null ? formatVitalValue('INP', entry.inpStat) : '-';
        if (entry.inpStat == null) tdInp.className = 'null-val';
        tr.appendChild(tdInp);

        const tdCls = document.createElement('td');
        tdCls.textContent = entry.clsStat != null ? formatVitalValue('CLS', entry.clsStat) : '-';
        if (entry.clsStat == null) tdCls.className = 'null-val';
        tr.appendChild(tdCls);

        const tdSamples = document.createElement('td');
        tdSamples.textContent = entry.samples.toLocaleString();
        tr.appendChild(tdSamples);

        tr.addEventListener('click', () => {
            vitalsPage = entry.url;
            const sel = document.getElementById('vitals-page-select');
            if (sel) sel.value = vitalsPage;
            renderVitalsFromApiData(getVitalsForPage(vitalsData, vitalsPage));
            updateVitalsRowSelection(tbody, vitalsPage);
        });

        tbody.appendChild(tr);
    });
}

function refreshVitalsSection(vitalsData) {
    const entries = buildVitalsPageStats(vitalsData);
    populateVitalsPageSelect(entries);

    if (vitalsPage !== 'all' && !entries.some(entry => entry.url === vitalsPage)) {
        vitalsPage = 'all';
        const sel = document.getElementById('vitals-page-select');
        if (sel) sel.value = vitalsPage;
    }

    renderVitalsWorstTable(entries, vitalsData);
    renderVitalsFromApiData(getVitalsForPage(vitalsData, vitalsPage));
}

//  Tier 1.5: Long Tasks

function initLongTaskObserver() {
    if (typeof window.PerformanceObserver === 'undefined') return;
    try {
        const observer = new PerformanceObserver((list) => {
            liveLongTask.supported = true;
            for (const entry of list.getEntries()) {
                const duration = Number(entry.duration ?? 0);
                if (!Number.isFinite(duration) || duration <= 0) continue;
                const blocking = Math.max(0, duration - LONG_TASK_THRESHOLD_MS);
                liveLongTask.count += 1;
                liveLongTask.totalBlockingMs += blocking;
                liveLongTask.maxDurationMs = Math.max(liveLongTask.maxDurationMs, duration);
            }
            renderLongTaskSection(getFilteredRows(cachedRows));
        });
        observer.observe({ type: 'longtask', buffered: true });
        liveLongTask.supported = true;
    } catch {
        liveLongTask.supported = false;
    }
}

function renderLongTaskSection(rows) {
    const sessionCountEl = document.querySelector('[data-longtask-session-count]');
    const avgBlockingEl = document.querySelector('[data-longtask-avg-blocking]');
    const maxTaskEl = document.querySelector('[data-longtask-max-task]');
    const tbody = document.querySelector('[data-longtask-rows]');
    const sourceEl = document.querySelector('[data-longtask-source]');

    if (!sessionCountEl || !avgBlockingEl || !maxTaskEl || !tbody) return;

    const byPage = new Map();
    const sessionsWithLongTasks = new Set();
    let totalBlockingMs = 0;
    let worstTaskMs = 0;
    let hasColumnData = false;
    let hasPayloadData = false;

    for (const row of rows) {
        const metrics = getLongTaskMetricsFromRow(row);
        const count = Number(metrics.count ?? 0);
        const blocking = Number(metrics.blockingMs ?? 0);
        const maxDuration = Number(metrics.maxDurationMs ?? 0);

        if (metrics.source === 'columns') hasColumnData = true;
        if (metrics.source === 'raw_payload') hasPayloadData = true;

        if (!Number.isFinite(count) || !Number.isFinite(blocking) || !Number.isFinite(maxDuration)) continue;
        if (count <= 0 && blocking <= 0 && maxDuration <= 0) continue;

        if (row.session_id) sessionsWithLongTasks.add(row.session_id);
        totalBlockingMs += Math.max(0, blocking);
        worstTaskMs = Math.max(worstTaskMs, maxDuration);

        const page = row.url ?? '(unknown)';
        if (!byPage.has(page)) {
            byPage.set(page, {
                page,
                sessions: new Set(),
                totalBlockingMs: 0,
                maxDurationMs: 0,
            });
        }

        const entry = byPage.get(page);
        if (row.session_id) entry.sessions.add(row.session_id);
        entry.totalBlockingMs += Math.max(0, blocking);
        entry.maxDurationMs = Math.max(entry.maxDurationMs, maxDuration);
    }

    if (liveLongTask.count > 0) {
        totalBlockingMs += liveLongTask.totalBlockingMs;
        worstTaskMs = Math.max(worstTaskMs, liveLongTask.maxDurationMs);
    }

    const sessionCount = sessionsWithLongTasks.size;
    const avgBlocking = sessionCount > 0 ? totalBlockingMs / sessionCount : null;

    sessionCountEl.textContent = sessionCount.toLocaleString();
    avgBlockingEl.textContent = avgBlocking != null ? fmtMs(avgBlocking) : (liveLongTask.count > 0 ? fmtMs(liveLongTask.totalBlockingMs) : '-');
    maxTaskEl.textContent = worstTaskMs > 0 ? fmtMs(worstTaskMs) : '-';

    if (sourceEl) {
        if (hasColumnData) {
            sourceEl.textContent = 'Source: historical rows (API columns) with live observer fallback.';
        } else if (hasPayloadData) {
            sourceEl.textContent = 'Source: historical rows parsed from raw payload plus live observer fallback.';
        } else if (liveLongTask.count > 0) {
            sourceEl.textContent = 'Source: live observer only (historical long-task fields unavailable in API rows).';
        } else if (liveLongTask.supported) {
            sourceEl.textContent = 'Source: waiting for long-task events in this tab.';
        } else {
            sourceEl.textContent = 'Source: Long Tasks API not supported in this browser.';
        }
    }

    const rowsForTable = [...byPage.values()]
        .sort((a, b) => b.totalBlockingMs - a.totalBlockingMs)
        .slice(0, 8);

    if (rowsForTable.length === 0) {
        if (liveLongTask.count > 0) {
            tbody.innerHTML = `
                <tr>
                    <td style="color:var(--text-muted)">1</td>
                    <td data-col="page">Current dashboard page</td>
                    <td>-</td>
                    <td>${escHtml(fmtMs(liveLongTask.totalBlockingMs))}</td>
                    <td>${escHtml(fmtMs(liveLongTask.totalBlockingMs))}</td>
                    <td>${escHtml(fmtMs(liveLongTask.maxDurationMs))}</td>
                </tr>
            `;
        } else {
            const msg = liveLongTask.supported
                ? 'No long-task data in selected range'
                : 'Long Tasks API not supported in this browser';
            tbody.innerHTML = `<tr><td colspan="6" class="null-val" style="text-align:center">${escHtml(msg)}</td></tr>`;
        }
        return;
    }

    tbody.innerHTML = rowsForTable.map((entry, idx) => {
        const sessionTotal = entry.sessions.size;
        const avgPerSession = sessionTotal > 0 ? entry.totalBlockingMs / sessionTotal : 0;
        return `<tr>
            <td style="color:var(--text-muted)">${idx + 1}</td>
            <td data-col="page" title="${escHtml(entry.page)}">${escHtml(pathname(entry.page))}</td>
            <td>${sessionTotal.toLocaleString()}</td>
            <td>${escHtml(fmtMs(entry.totalBlockingMs))}</td>
            <td>${escHtml(fmtMs(avgPerSession))}</td>
            <td>${escHtml(fmtMs(entry.maxDurationMs))}</td>
        </tr>`;
    }).join('');
}

function initCoreWebVitals() {
    // FCP - from paint observer
    try {
        new PerformanceObserver((list) => {
            const fcp = list.getEntriesByName('first-contentful-paint')[0];
            if (fcp) {
                setVitalMeta('FCP', 1);
                renderVital('FCP', fcp.startTime, 1800, 3000, 'Live');
            }
        }).observe({ type: 'paint', buffered: true });
    } catch {}

    // TTFB - from Navigation Timing
    try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
            const ttfb = nav.responseStart - nav.requestStart;
            if (ttfb >= 0) {
                setVitalMeta('TTFB', 1);
                renderVital('TTFB', ttfb, 800, 1800, 'Live');
            }
        }
    } catch {}

    // LCP - live fallback (will be overridden by API P75)
    try {
        new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lcp = entries[entries.length - 1];
            if (lcp) {
                const card = document.querySelector('[data-vital="LCP"]');
                // Only update if still showing default state
                if (card && card.querySelector('.vital-value').textContent === '-') {
                    setVitalMeta('LCP', 1);
                    renderVital('LCP', lcp.startTime, 2500, 4000, 'Live');
                }
            }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    // CLS - live fallback
    try {
        let clsValue = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) clsValue += entry.value;
            }
            const card = document.querySelector('[data-vital="CLS"]');
            if (card && card.querySelector('.vital-value').textContent === '-') {
                setVitalMeta('CLS', 1);
                renderVital('CLS', clsValue, 0.1, 0.25, 'Live');
            }
        }).observe({ type: 'layout-shift', buffered: true });
    } catch {}

    // INP - live fallback
    try {
        let maxInp = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.duration > maxInp) {
                    maxInp = entry.duration;
                    const card = document.querySelector('[data-vital="INP"]');
                    if (card && card.querySelector('.vital-value').textContent === '-') {
                        setVitalMeta('INP', 1);
                        renderVital('INP', maxInp, 200, 500, 'Live');
                    }
                }
            }
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch {}

    // Sparklines are driven by filtered API data.
}

//  Tier 2: Resource Timing 

function getResourceType(entry) {
    const url  = entry.name;
    const init = entry.initiatorType;
    if (init === 'xmlhttprequest' || init === 'fetch') return 'API';
    if (/\.js(\?|$)/.test(url))                         return 'JS';
    if (/\.css(\?|$)/.test(url))                        return 'CSS';
    if (/\.(woff2?|ttf|eot|otf)/.test(url))             return 'Font';
    if (/\.(png|jpe?g|gif|webp|svg|avif|ico)/.test(url)) return 'Image';
    return 'Other';
}

const RESOURCE_COLORS = {
    JS: '#f59e0b', CSS: '#3b82f6', Image: '#10b981',
    Font: '#f87171', API: '#b94ff7', Other: '#717a96',
};

function renderResourceBreakdown(typeMap, sizeMap, totalReqs, cacheRate) {
    const totalSize = Object.values(sizeMap).reduce((a, b) => a + b, 0);

    for (const [type, size] of Object.entries(sizeMap)) {
        const row = document.querySelector(`[data-resource-bar="${type}"]`);
        if (!row) continue;
        const pct = totalSize > 0 ? Math.round((size / totalSize) * 100) : 0;
        const fill = row.querySelector('.resource-fill');
        if (fill) {
            fill.style.width     = pct + '%';
            fill.style.background = RESOURCE_COLORS[type] ?? '#717a96';
        }
        const pctEl  = row.querySelector('.resource-pct');
        const sizeEl = row.querySelector('.resource-size');
        if (pctEl)  pctEl.textContent  = pct + '%';
        if (sizeEl) sizeEl.textContent = formatBytes(size);
    }

    const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
    set('[data-total-size]', formatBytes(totalSize));
    set('[data-total-reqs]', totalReqs.toLocaleString());
    set('[data-cache-rate]', cacheRate + '%');
}

function renderSlowestRequests(resources) {
    const tbody = document.querySelector('[data-slow-requests]');
    if (!tbody) return;

    const sorted = [...resources]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 8);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="null-val" style="text-align:center">No resource data available</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map((r, i) => {
        const name    = r.name.split('/').pop().split('?')[0] || r.name;
        const type    = getResourceType(r);
        const dur     = Math.round(r.duration);
        const size    = r.transferSize > 0 ? formatBytes(r.transferSize) : '-';
        const cached  = r.transferSize === 0 && r.decodedBodySize > 0;
        const durCls  = dur > 1000 ? 'error-val' : dur > 500 ? 'warn-val' : '';
        return `<tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td data-col="page" title="${escHtml(r.name)}">${escHtml(name)}</td>
            <td><span class="type-badge type-${type.toLowerCase()}">${escHtml(type)}</span></td>
            <td class="${durCls}">${dur.toLocaleString()}ms</td>
            <td>${escHtml(size)}</td>
            <td>${cached ? '<span class="good-val">Cached ✅</span>' : '-'}</td>
        </tr>`;
    }).join('');
}

function renderWaterfall(resources) {
    const axis      = document.querySelector('[data-waterfall-axis]');
    const container = document.querySelector('[data-waterfall]');
    if (!axis || !container) return;

    if (resources.length === 0) {
        container.innerHTML = '<li class="null-val" style="padding:1rem">No resource data available</li>';
        return;
    }

    const nav     = performance.getEntriesByType('navigation')[0];
    const pageEnd = nav
        ? Math.max(nav.loadEventEnd, ...resources.map(r => r.responseEnd))
        : Math.max(...resources.map(r => r.responseEnd));
    const totalMs = Math.max(pageEnd, 100);

    // Sort by startTime, take top 20
    const sorted = [...resources]
        .sort((a, b) => a.startTime - b.startTime)
        .slice(0, 20);

    // Axis tick marks
    const tickCount = 6;
    axis.innerHTML = '';
    for (let t = 0; t <= tickCount; t++) {
        const ms  = (totalMs / tickCount) * t;
        const pct = (ms / totalMs) * 100;
        const tick = document.createElement('span');
        tick.className = 'wf-tick';
        tick.style.left = pct + '%';
        tick.textContent = ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms';
        axis.appendChild(tick);
    }

    // Waterfall rows
    container.innerHTML = '';
    sorted.forEach(r => {
        const type   = getResourceType(r);
        const name   = r.name.split('/').pop().split('?')[0] || r.name.split('/').slice(-2).join('/');
        const left   = (r.startTime / totalMs) * 100;
        const width  = Math.max((r.duration / totalMs) * 100, 0.3);
        const row    = document.createElement('li');
        row.className = 'wf-row';
        row.innerHTML = `
            <span class="wf-name" title="${escHtml(r.name)}">${escHtml(name.length > 35 ? name.slice(0, 33) + '...' : name)}</span>
            <div class="wf-bar-track">
                <div class="wf-bar wf-${type.toLowerCase()}"
                     style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"
                     title="${escHtml(r.name)}&#10;Start: ${Math.round(r.startTime)}ms&#10;Duration: ${Math.round(r.duration)}ms&#10;Type: ${type}"></div>
            </div>
            <span class="wf-dur">${Math.round(r.duration)}ms</span>
        `;
        container.appendChild(row);
    });
}

function processResources() {
    window.addEventListener('load', () => {
        setTimeout(() => {
            try {
                const resources = performance.getEntriesByType('resource');
                if (!resources.length) return;

                const typeMap = { JS: 0, CSS: 0, Image: 0, Font: 0, API: 0, Other: 0 };
                const sizeMap = { JS: 0, CSS: 0, Image: 0, Font: 0, API: 0, Other: 0 };
                let cached = 0;

                for (const r of resources) {
                    const type = getResourceType(r);
                    typeMap[type] = (typeMap[type] || 0) + 1;
                    sizeMap[type] = (sizeMap[type] || 0) + (r.transferSize || 0);
                    if (r.transferSize === 0 && r.decodedBodySize > 0) cached++;
                }

                const cacheRate = resources.length > 0
                    ? Math.round((cached / resources.length) * 100) : 0;

                renderResourceBreakdown(typeMap, sizeMap, resources.length, cacheRate);
                renderSlowestRequests(resources);
                renderWaterfall(resources);
            } catch (e) {
                console.warn('[performance] Resource Timing:', e);
            }
        }, 200);
    });
}

//  Tier 3: Device Segmentation 

function deriveDevice(vpWidth) {
    const w = Number(vpWidth);
    if (!w || isNaN(w)) return 'unknown';
    if (w < 768)  return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
}

function getRegionHeuristic(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, language = '') {
    const tz = String(timeZone ?? '');
    const lang = String(language ?? '').toLowerCase();

    if (tz.startsWith('America/')) {
        if (
            tz.includes('Los_Angeles') ||
            tz.includes('Denver') ||
            tz.includes('Phoenix') ||
            tz.includes('Anchorage') ||
            tz.includes('Tijuana') ||
            tz.includes('Vancouver')
        ) {
            return 'US West';
        }
        if (
            tz.includes('Sao_Paulo') ||
            tz.includes('Buenos_Aires') ||
            tz.includes('Santiago') ||
            tz.includes('Bogota') ||
            tz.includes('Lima') ||
            tz.includes('Caracas')
        ) {
            return 'South America';
        }
        return 'US East';
    }
    if (tz.startsWith('Europe/')) return 'Europe';
    if (tz.startsWith('Asia/')) return 'Asia';
    if (tz.startsWith('Africa/')) return 'Africa';
    if (tz.startsWith('Australia/')) return 'Australia';

    // Fallback: infer broad region from locale when timezone is unavailable.
    if (/\b(es|pt)-(?:ar|bo|br|cl|co|ec|gy|pe|py|sr|uy|ve)\b/.test(lang)) return 'South America';
    if (/\b(en|es|fr)-(?:za|ng|eg|ke|gh|ma|dz|tn)\b/.test(lang)) return 'Africa';
    if (/\b(en)-(?:au|nz)\b/.test(lang)) return 'Australia';
    if (/\b(en)-(?:us|ca)\b/.test(lang)) return 'US East';
    if (/\b(en|fr|de|it|es|pt)-(?:gb|ie|fr|de|it|es|pt|nl|be|se|no|dk|fi|pl)\b/.test(lang)) return 'Europe';
    if (/\b(zh|ja|ko|hi|th|vi|id|ms)\b/.test(lang)) return 'Asia';

    return 'Other';
}

function renderGeographySegment(technoData) {
    const rowsEl = document.querySelector('[data-geo-rows]');
    const summaryEl = document.querySelector('[data-geo-summary]');
    const tooltipEl = document.querySelector('[data-geo-tooltip]');
    if (!rowsEl || !summaryEl) return;

    const totals = new Map();
    const sessionSeen = new Set();

    for (const t of technoData) {
        const sid = t.session_id ?? null;
        if (sid && sessionSeen.has(sid)) continue;
        if (sid) sessionSeen.add(sid);

        const timeZone = t.timezone ?? t.time_zone ?? t.tz ?? '';
        const region = getRegionHeuristic(timeZone, t.language);
        totals.set(region, (totals.get(region) ?? 0) + 1);
    }

    const entries = [...totals.entries()]
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    const totalCount = entries.reduce((sum, entry) => sum + entry.count, 0);

    summaryEl.textContent = totalCount > 0
        ? `${totalCount.toLocaleString()} sessions in selected range`
        : 'No geography data in selected range';

    if (!entries.length) {
        rowsEl.innerHTML = '<li class="null-val" style="padding:1rem">No geography data available</li>';
        return;
    }

    const maxCount = Math.max(...entries.map(entry => entry.count), 1);

    rowsEl.innerHTML = entries.map(entry => {
        const widthPct = Math.max((entry.count / maxCount) * 75, 2.5);
        const sharePct = totalCount > 0 ? ((entry.count / totalCount) * 100) : 0;
        const barClass = entry.region === 'US West' || entry.region === 'US East'
            ? 'geo-americas'
            : entry.region === 'Europe'
                ? 'geo-europe'
                : entry.region === 'Asia'
                    ? 'geo-asia'
                    : entry.region === 'Africa'
                        ? 'geo-africa'
                        : entry.region === 'Australia'
                            ? 'geo-australia'
                            : 'geo-other';

        return `<li class="wf-row geo-row">
            <span class="wf-name">${escHtml(entry.region)}</span>
            <div class="wf-bar-track">
                <div class="wf-bar ${barClass}" style="left:0%;width:${widthPct.toFixed(2)}%" data-geo-region="${escHtml(entry.region)}" data-geo-sessions="${entry.count}" data-geo-share="${sharePct.toFixed(1)}"></div>
            </div>
            <span class="wf-dur">${entry.count.toLocaleString()} / ${sharePct.toFixed(1)}%</span>
        </li>`;
    }).join('');

    if (!tooltipEl) return;

    const bars = rowsEl.querySelectorAll('.wf-bar');
    bars.forEach(bar => {
        bar.addEventListener('mousemove', e => {
            const region = bar.dataset.geoRegion ?? 'Unknown';
            const sessions = Number(bar.dataset.geoSessions ?? 0).toLocaleString();
            const share = bar.dataset.geoShare ?? '0.0';

            tooltipEl.innerHTML = `<strong>${escHtml(region)}</strong><br>Sessions: ${escHtml(sessions)}<br>Share: ${escHtml(share)}%`;
            tooltipEl.style.display = 'block';

            const offset = 12;
            const rect = tooltipEl.getBoundingClientRect();
            let left = e.clientX + offset;
            let top = e.clientY - rect.height - offset;

            if (left + rect.width > window.innerWidth - 8) left = e.clientX - rect.width - offset;
            if (top < 8) top = e.clientY + offset;

            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
        });

        bar.addEventListener('mouseleave', () => {
            tooltipEl.style.display = 'none';
        });
    });
}

function renderDeviceSegment(technoData, vitalsData) {
    const groups = { mobile: [], tablet: [], desktop: [] };

    // Build a session->lcp map from vitals
    const sessionLcp = new Map();
    for (const v of vitalsData) {
        const lcp = Number(v.vital_lcp);
        if (v.session_id && lcp > 0) {
            if (!sessionLcp.has(v.session_id) || lcp < sessionLcp.get(v.session_id)) {
                sessionLcp.set(v.session_id, lcp);
            }
        }
    }

    // Group technographics by device, merge lcp if available
    for (const t of technoData) {
        const device = deriveDevice(t.viewport_width);
        if (!groups[device]) continue;
        const lcp = t.session_id ? sessionLcp.get(t.session_id) : undefined;
        groups[device].push({ lcp });
    }

    for (const [device, entries] of Object.entries(groups)) {
        const card = document.querySelector(`[data-device="${device}"]`);
        if (!card) continue;

        const lcpValues = entries.map(e => e.lcp).filter(v => v > 0);
        const avgLcp    = lcpValues.length
            ? Math.round(lcpValues.reduce((a, b) => a + b, 0) / lcpValues.length)
            : null;

        const lcpEl      = card.querySelector('.device-lcp-val');
        const sessionEl  = card.querySelector('.device-session-count');

        if (lcpEl) lcpEl.textContent = avgLcp != null ? fmtMs(avgLcp) : '-';
        if (sessionEl) sessionEl.textContent = entries.length.toLocaleString();

        // Color device card based on avg LCP
        card.classList.remove('good', 'warn', 'bad');
        if (avgLcp != null) {
            card.classList.add(avgLcp <= 2500 ? 'good' : avgLcp <= 4000 ? 'warn' : 'bad');
        }
    }
}

//  Tier 3: Performance vs Engagement 

function renderConversionBySpeed(rows, sessionData) {
    const tbody = document.querySelector('[data-conversion-table]');
    if (!tbody) return;

    // Build bounce session set
    const bounceSessions = new Set(
        sessionData
            .filter(s => Number(s.pageview_count) === 1)
            .map(s => s.session_id)
    );

    // Buckets: fast (<2500), needs-work (2500-4000), poor (>4000), unknown
    const buckets = {
        fast:       { label: 'Fast',        range: '< 2500ms', lcps: [], sessions: new Set() },
        needs_work: { label: 'Needs Work',  range: '2500-4000ms', lcps: [], sessions: new Set() },
        poor:       { label: 'Poor',        range: '> 4000ms', lcps: [], sessions: new Set() },
        unknown:    { label: 'No LCP data', range: '-',        lcps: [], sessions: new Set() },
    };

    for (const row of rows) {
        if (row.event_type === 'error') continue;
        const lcp = Number(row.vital_lcp);
        const sid = row.session_id;
        if (!sid) continue;

        let bucket;
        if (!lcp || lcp === 0) bucket = 'unknown';
        else if (lcp < 2500)   bucket = 'fast';
        else if (lcp <= 4000)  bucket = 'needs_work';
        else                   bucket = 'poor';

        buckets[bucket].sessions.add(sid);
        if (lcp > 0) buckets[bucket].lcps.push(lcp);
    }

    const order = ['fast', 'needs_work', 'poor', 'unknown'];
    tbody.innerHTML = order.map(key => {
        const b           = buckets[key];
        const total       = b.sessions.size;
        if (total === 0) return '';

        const bounceCount = [...b.sessions].filter(sid => bounceSessions.has(sid)).length;
        const bounceRate  = total > 0 ? ((bounceCount / total) * 100).toFixed(1) + '%' : '-';
        const avgLcp      = b.lcps.length
            ? fmtMs(b.lcps.reduce((a, v) => a + v, 0) / b.lcps.length)
            : '-';

        const bounceCls = bounceCount / total >= 0.7 ? 'error-val'
                        : bounceCount / total >= 0.5 ? 'warn-val' : '';

        const insight = key === 'fast'       ? 'Keep it up!'
                      : key === 'needs_work' ? 'Optimize images & JS'
                      : key === 'poor'       ? 'Critical - significant user impact'
                      : 'Instrument LCP for full visibility';

        return `<tr>
            <td>${escHtml(b.label)}</td>
            <td style="color:var(--text-muted)">${escHtml(b.range)}</td>
            <td>${total.toLocaleString()}</td>
            <td class="${bounceCls}">${escHtml(bounceRate)}</td>
            <td>${escHtml(avgLcp)}</td>
            <td style="color:var(--text-muted);font-style:italic">${escHtml(insight)}</td>
        </tr>`;
    }).join('');

    if (!tbody.innerHTML.trim()) {
        tbody.innerHTML = '<tr><td colspan="6" class="null-val" style="text-align:center">No LCP data in the selected time range</td></tr>';
    }
}

//  Underperforming Pages (with unique JS errors) 

function buildUniqueErrorMap(errorRows) {
    // Map URL -> Set of unique "type|message" fingerprints
    const map = new Map();
    for (const row of errorRows) {
        const url = row.url ?? '(unknown)';
        if (!map.has(url)) map.set(url, new Set());
        try {
            const p = typeof row.raw_payload === 'string'
                ? JSON.parse(row.raw_payload)
                : (row.raw_payload ?? {});
            const type    = p?.error?.type    ?? '';
            const message = p?.error?.message ?? '';
            const key     = `${type}|${message}`.trim();
            if (key !== '|') map.get(url).add(key);
        } catch { /* skip malformed */ }
    }
    return map;
}

function suggestedAction(m) {
    const avgSec = m.avgMs !== null ? m.avgMs / 1000 : Infinity;
    if (m.uniqueErrors > 0 && m.bounceRate >= 0.50) return 'Fix JS errors (impacting bounce)';
    if (m.uniqueErrors > 0)                          return 'Fix JS errors';
    if (m.bounceRate >= 0.70 && avgSec < 10)         return 'Improve content relevance';
    if (m.bounceRate >= 0.70)                         return 'Reduce bounce rate';
    if (avgSec < 10 && m.views >= 20)                 return 'Increase content depth';
    if (avgSec < 30)                                  return 'Improve engagement';
    return 'Monitor';
}

function renderUnderperf(urlMap, bounceSessions, uniqueErrorMap) {
    const tbody = document.getElementById('underperf-tbody');
    const wrap  = document.getElementById('underperf-wrap');
    if (!tbody) return;

    const candidates = [];

    for (const entry of urlMap.values()) {
        const totalSessions = entry.sessions.size;
        const avgMs         = entry.durationCount > 0
            ? entry.totalDuration / entry.durationCount : null;
        const avgSec        = avgMs !== null ? avgMs / 1000 : Infinity;
        const uniqueErrors  = uniqueErrorMap
            ? (uniqueErrorMap.get(entry.url)?.size ?? 0) : 0;

        let bounceCount = 0;
        for (const sid of entry.sessions) {
            if (bounceSessions.has(sid)) bounceCount++;
        }
        const bounceRate = totalSessions > 0 ? bounceCount / totalSessions : 0;

        const flagBounce = bounceRate >= 0.50 && totalSessions >= 5;
        const flagTime   = avgSec < 30 && entry.durationCount >= 5;
        const flagErrors = uniqueErrors > 0;

        if (!flagBounce && !flagTime && !flagErrors) continue;

        candidates.push({ entry, bounceRate, avgMs, avgSec, uniqueErrors });
    }

    // Sort: prioritize pages with highest unique error count, then bounce rate
    candidates.sort((a, b) =>
        b.uniqueErrors - a.uniqueErrors ||
        b.bounceRate - a.bounceRate ||
        (a.avgSec - b.avgSec)
    );

    tbody.innerHTML = '';

    if (candidates.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan   = 6;
        td.textContent = 'No underperforming pages detected.';
        td.style.textAlign = 'center';
        td.className = 'null-val';
        tr.appendChild(td);
        tbody.appendChild(tr);
        if (wrap) wrap.hidden = false;
        return;
    }

    candidates.forEach(({ entry, bounceRate, avgMs, uniqueErrors }) => {
        const path      = pathname(entry.url);
        const pctStr    = (bounceRate * 100).toFixed(1) + '%';
        const action    = suggestedAction({
            bounceRate, avgMs, errors: entry.errors, views: entry.views, uniqueErrors,
        });
        const bounceCls = bounceRate >= 0.70 ? 'error-val'
                        : bounceRate >= 0.50 ? 'warn-val' : '';
        const errCls    = uniqueErrors > 3 ? 'error-val' : uniqueErrors > 0 ? 'warn-val' : 'null-val';

        const tr = document.createElement('tr');

        const tdPage = document.createElement('td');
        tdPage.dataset.col = 'page';
        const a = document.createElement('a');
        a.href        = entry.url;
        a.textContent = path;
        a.title       = entry.url;
        tdPage.appendChild(a);
        tr.appendChild(tdPage);

        const tdViews = document.createElement('td');
        tdViews.textContent = entry.views.toLocaleString();
        tr.appendChild(tdViews);

        const tdBounce = document.createElement('td');
        tdBounce.textContent = pctStr;
        if (bounceCls) tdBounce.className = bounceCls;
        tr.appendChild(tdBounce);

        const tdTime = document.createElement('td');
        if (avgMs === null) {
            tdTime.textContent = '-';
            tdTime.className   = 'null-val';
        } else {
            tdTime.textContent = fmtDuration(avgMs);
        }
        tr.appendChild(tdTime);

        const tdErr = document.createElement('td');
        tdErr.className = errCls;
        tdErr.textContent = uniqueErrors > 0 ? `${uniqueErrors} unique` : '-';
        tr.appendChild(tdErr);

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

//  Chart: Time-on-Page Trend (line) 

function drawTrendLine(urlMap, selectedUrl) {
    const canvas  = document.getElementById('trendChart');
    const tooltip = document.getElementById('trend-tooltip');
    if (!canvas) return;

    if (trendAbort) trendAbort.abort();
    trendAbort = new AbortController();

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

    const data = Object.entries(buckets).map(([key, b]) => ({
        date:  new Date(key + 'T12:00:00'),
        value: b.count > 0 ? b.total / b.count / 1000 : 0,
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

    function drawChart(c) {
        c.clearRect(0, 0, canvas.width, canvas.height);

        const pageLabel = selectedUrl ? pathname(selectedUrl) : 'All Pages';
        c.fillStyle = '#e8eaf0';
        c.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(`Avg. Time on Page - ${pageLabel}`, canvas.width / 2, 10);

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

        c.beginPath();
        c.strokeStyle = 'rgba(255,255,255,0.15)';
        c.lineWidth = 2;
        c.moveTo(margin.left, margin.top);
        c.lineTo(margin.left, margin.top + cH);
        c.lineTo(margin.left + cW, margin.top + cH);
        c.stroke();

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

    drawChart(ctx);

    const caption = document.getElementById('trend-caption');
    if (caption) {
        const keys = Object.keys(make30DayBuckets());
        caption.textContent =
            `Average time on page per day, ${keys[0]} - ${keys[keys.length - 1]}`;
    }
}

//  Populate selects 

function populateTrendSelect(urlMap) {
    const sel = document.getElementById('trend-page-select');
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    const sorted = [...urlMap.values()]
        .sort((a, b) => b.views - a.views)
        .slice(0, 30);
    for (const entry of sorted) {
        const opt = document.createElement('option');
        opt.value       = entry.url;
        opt.textContent = pathname(entry.url);
        sel.appendChild(opt);
    }
}

function populatePageSelect(urlMap) {
    const sel = document.getElementById('page-select');
    if (!sel) return;
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    const sorted = [...urlMap.values()].sort((a, b) => b.views - a.views);
    for (const entry of sorted) {
        const opt = document.createElement('option');
        opt.value       = entry.url;
        opt.textContent = pathname(entry.url);
        if (opt.value === current) opt.selected = true;
        sel.appendChild(opt);
    }
}

//  Filter label 

function updateFilterLabel() {
    const label   = document.getElementById('filter-label');
    if (!label) return;
    const pageLbl = filters.page === 'all' ? 'All Pages' : pathname(filters.page);
    const dayLbl  = filters.days === 1 ? 'Last 24 hours' : `Last ${filters.days} days`;
    label.textContent = `${pageLbl} · ${dayLbl}`;
}

//  Master refresh 

function refreshAllSections() {
    const filteredRows        = getFilteredRows(cachedRows);
    const filteredSessionData = getFilteredSessionData(cachedSessionData);
    const filteredVitals      = getFilteredVitals(cachedVitals);
    const vitalsInRange        = getTimeFilteredVitals(cachedVitals);
    const filteredTechno      = getFilteredTechno(cachedTechno);

    const { urlMap, bounceSessions } =
        buildAggregates(filteredRows, filteredSessionData);

    const trendSel  = document.getElementById('trend-page-select');

    drawTrendLine(urlMap, trendSel?.value ?? '');

    const uniqueErrorMap = buildUniqueErrorMap(cachedErrors);
    renderUnderperf(urlMap, bounceSessions, uniqueErrorMap);

    // Populate selects
    populateTrendSelect(urlMap);
    populatePageSelect(urlMap);

    // Tier 1: vitals table + cards (time filter only)
    refreshVitalsSection(vitalsInRange);
    renderLongTaskSection(filteredRows);

    // Tier 3
    renderDeviceSegment(filteredTechno, filteredVitals);
    renderGeographySegment(filteredTechno);
    renderConversionBySpeed(filteredRows, filteredSessionData);

    updateFilterLabel();
}

//  Wire controls 

function bindFilterControls() {
    // Time range buttons
    document.querySelectorAll('[data-days]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-days]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filters.days = Number(btn.dataset.days);
            refreshAllSections();
        });
    });

    // Page selector
    document.getElementById('page-select')?.addEventListener('change', e => {
        filters.page = e.target.value;
        refreshAllSections();
    });

    document.getElementById('vitals-page-select')?.addEventListener('change', e => {
        vitalsPage = e.target.value;
        refreshVitalsSection(getTimeFilteredVitals(cachedVitals));
    });

    // Chart controls (trend page)
    document.getElementById('trend-page-select')?.addEventListener('change', () => refreshAllSections());
    document.getElementById('vital-stat-select')?.addEventListener('change', () => refreshAllSections());
}

//  Init 

async function init() {
    // Start resource timing collection (runs after page load)
    processResources();

    // Start live Core Web Vitals observers immediately
    initCoreWebVitals();
    initLongTaskObserver();

    try {
        const [pageviews, sessions, vitalsResp, technoResp, errorsResp] = await Promise.all([
            apiFetch('/pageviews?limit=1000'),
            apiFetch('/sessions'),
            apiFetch('/vitals'),
            apiFetch('/technographics'),
            apiFetch('/errors'),
        ]);

        cachedRows        = pageviews.data ?? [];
        cachedSessionData = sessions.data  ?? [];
        cachedVitals      = vitalsResp.data ?? [];
        cachedTechno      = technoResp.data ?? [];
        cachedErrors      = errorsResp.data ?? [];

        bindFilterControls();
        refreshAllSections();

    } catch (err) {
        console.error('[performance]', err);
        showError(err.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
