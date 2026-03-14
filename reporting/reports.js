/**
 * reports.js — Reports list page
 * Pulls saved reports metadata from server API.
 */

'use strict';

const BASE = '/api';

async function apiFetch(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`API ${path} -> HTTP ${res.status}`);
  const ct = res.headers.get('Content-Type') ?? '';
  if (!ct.includes('application/json')) throw new Error(`Unexpected Content-Type "${ct}" for ${path}`);
  return res.json();
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

function resolveOpenUrl(report) {
  if (report.file_url) return report.file_url;
  const page = (report.page || '').toLowerCase();
  const pageFile = page === 'engagement' ? 'engagement.html'
    : page === 'performance' ? 'performance.html'
    : 'errors.html';
  return `${pageFile}?reportId=${encodeURIComponent(report.report_id || '')}`;
}

async function renderTable() {
  const tbody = document.getElementById('reportsTableBody');
  if (!tbody) return;

  let reports = [];
  try {
    const res = await apiFetch('/reports?limit=500');
    reports = res.data ?? [];
  } catch (err) {
    console.error('[reports] load failed', err);
    tbody.innerHTML = '<tr><td class="empty-state" colspan="5">Could not load reports from server.</td></tr>';
    return;
  }

  if (!reports.length) {
    tbody.innerHTML = '<tr><td class="empty-state" colspan="5">No reports saved yet.</td></tr>';
    return;
  }

  tbody.innerHTML = reports
    .map((r) => `
      <tr data-url="${resolveOpenUrl(r)}">
        <td>${r.report_name ? r.report_name : 'Untitled report'}</td>
        <td><span class="report-pill">${r.category || 'Report'}</span></td>
        <td><span class="report-pill ${r.status === 'ready' ? 'status-ready' : 'status-pending'}">${r.status || 'pending'}</span></td>
        <td>${formatDate(r.created_at)}</td>
        <td><a class="report-open" href="${resolveOpenUrl(r)}" target="_blank" rel="noopener">${r.file_url ? 'Open PDF' : 'Open Report'}</a></td>
      </tr>
    `)
    .join('');

  tbody.querySelectorAll('tr[data-url]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.tagName.toLowerCase() === 'a') return;
      const url = row.getAttribute('data-url');
      if (url && url !== '#') window.location.href = url;
    });
  });
}

document.addEventListener('DOMContentLoaded', renderTable);
