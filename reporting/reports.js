/**
 * reports.js — Reports list page
 * Pulls saved reports metadata from localStorage.
 */

'use strict';

function loadReports() {
  try {
    const raw = localStorage.getItem('analytics:reports');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
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

function renderTable() {
  const tbody = document.getElementById('reportsTableBody');
  if (!tbody) return;

  const reports = loadReports();
  if (!reports.length) {
    tbody.innerHTML = '<tr><td class="empty-state" colspan="4">No reports saved yet.</td></tr>';
    return;
  }

  tbody.innerHTML = reports
    .map((r) => `
      <tr data-url="${r.printUrl || r.viewUrl || '#'}">
        <td>${r.name ? r.name : 'Untitled report'}</td>
        <td><span class="report-pill">${r.category || 'Report'}</span></td>
        <td>${formatDate(r.createdAt)}</td>
        <td><a class="report-open" href="${r.printUrl || r.viewUrl || '#'}">Open PDF</a></td>
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
