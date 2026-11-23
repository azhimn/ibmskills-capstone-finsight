/**
 * js/table.js — Transactions table
 *
 * Responsibilities:
 *  - Render filterable, sortable, paginated transactions table
 *  - Anomaly row indicators
 *  - Filter controls: search, category, month, anomaly toggle
 *  - Configurable pagination (10/20/50/100 rows/page)
 *  - Live ARIA announcements for filter/page changes
 *
 * Reads from AppData + Analytics.
 * Does not modify either singleton.
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const TableState = {
  /** @type {Transaction[]} Currently filtered & sorted set */
  filtered: [],

  /** Active sort column */
  sortCol: 'date',

  /** Sort direction */
  sortDir: 'asc',

  /** Current page (1-based) */
  page: 1,

  /** Rows per page */
  pageSize: 20,

  // Filter values
  search:       '',
  category:     '',
  month:        '',
  anomalyOnly:  false,
};

// ─── Category color map (inherits from charts.js catColorMap) ─────────────────

/** Category pill background colors (10% opacity version) */
function catPillStyle(category) {
  const color = getCatColor(category);
  return `background:${color}1a; color:${color}; border:1px solid ${color}44;`;
}

// ─── Filter logic ─────────────────────────────────────────────────────────────

/**
 * Apply all active filters and sort to AppData.transactions.
 * Updates TableState.filtered and resets page to 1.
 */
function applyFilters() {
  const { search, category, month, anomalyOnly, sortCol, sortDir } = TableState;
  const searchLower = search.toLowerCase();

  let result = AppData.transactions.filter(txn => {
    if (anomalyOnly && !txn.isAnomaly) return false;
    if (category && txn.category !== category) return false;
    if (month    && txn.monthKey !== month)    return false;
    if (search   && !txn.description.toLowerCase().includes(searchLower)
                 && !txn.category.toLowerCase().includes(searchLower)
                 && !String(txn.amount).includes(search)) return false;
    return true;
  });

  // Sort
  result.sort((a, b) => {
    let av, bv;
    switch (sortCol) {
      case 'date':        av = a.date.getTime(); bv = b.date.getTime(); break;
      case 'description': av = a.description.toLowerCase(); bv = b.description.toLowerCase(); break;
      case 'category':    av = a.category.toLowerCase();    bv = b.category.toLowerCase();    break;
      case 'amount':      av = a.amount;         bv = b.amount;         break;
      default:            av = a.date.getTime(); bv = b.date.getTime();
    }
    if (av < bv) return sortDir === 'asc' ? -1 :  1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  TableState.filtered = result;
  TableState.page     = 1;      // reset to first page on filter change
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

/**
 * Build one <tr> for a transaction.
 * @param {Transaction} txn
 * @returns {string} HTML string
 */
function buildRow(txn) {
  const isHigh   = txn.amount > Analytics.iqrUpperFence * 0.7;  // near-anomaly shade
  const amtClass = txn.isAnomaly || isHigh ? 'amount high' : 'amount';

  // Anomaly indicator cell
  const indicator = txn.isAnomaly
    ? `<span class="anomaly-badge" title="Anomaly: Z-score ${txn._zScore}">
         <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
           <path d="M3.11 1.46a1 1 0 011.78 0l2.6 4.5A1 1 0 016.6 7.5H1.4a1 1 0 01-.89-1.54l2.6-4.5z"/>
         </svg>
         ⚠
       </span>`
    : `<span class="sr-only">Normal</span>`;

  // Truncate long descriptions
  const desc = txn.description.length > 60
    ? `<span title="${escapeHtml(txn.description)}">${escapeHtml(txn.description.substring(0, 60))}…</span>`
    : escapeHtml(txn.description);

  return `
    <tr class="${txn.isAnomaly ? 'row-anomaly' : ''}" data-idx="${txn.idx}">
      <td class="indicator" aria-label="${txn.isAnomaly ? 'Anomaly' : 'Normal'}">${indicator}</td>
      <td class="whitespace-nowrap tabnum">${txn.dateStr}</td>
      <td class="max-w-xs">${desc}</td>
      <td>
        <span class="cat-pill" style="${catPillStyle(txn.category)}">${escapeHtml(txn.category)}</span>
      </td>
      <td class="${amtClass}">${formatCurrency(txn.amount)}</td>
    </tr>`;
}

// ─── Pagination renderer ──────────────────────────────────────────────────────

/**
 * Render pagination controls into #pagination-nav.
 * Uses ellipsis for large page counts.
 */
function renderPagination() {
  const total      = TableState.filtered.length;
  const pageSize   = TableState.pageSize;
  const page       = TableState.page;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const nav        = document.getElementById('pagination-nav');
  const info       = document.getElementById('pagination-info');
  if (!nav || !info) return;

  // Info text
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);
  info.textContent = total > 0 ? `${from}–${to} of ${total}` : '0 results';

  // Build page button list with ellipsis
  const buttons = [];

  // Prev
  buttons.push(
    `<button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}
      aria-label="Previous page">‹</button>`
  );

  // Page numbers with ellipsis
  const pages = pageRange(page, totalPages);
  let prev = null;
  for (const p of pages) {
    if (prev !== null && p - prev > 1) {
      buttons.push(`<span class="text-ink-muted text-sm px-1" aria-hidden="true">…</span>`);
    }
    buttons.push(
      `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}"
        aria-label="Page ${p}" ${p === page ? 'aria-current="page"' : ''}>${p}</button>`
    );
    prev = p;
  }

  // Next
  buttons.push(
    `<button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}
      aria-label="Next page">›</button>`
  );

  nav.innerHTML = buttons.join('');
}

/**
 * Compute visible page numbers for pagination.
 * Always shows first, last, current ±1, with gaps filled by ellipsis.
 *
 * @param {number} current
 * @param {number} total
 * @returns {number[]}
 */
function pageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const set = new Set([1, total, current]);
  if (current > 1)      set.add(current - 1);
  if (current < total)  set.add(current + 1);
  if (current <= 3)     { set.add(2); set.add(3); }
  if (current >= total - 2) { set.add(total - 1); set.add(total - 2); }

  return [...set].sort((a, b) => a - b);
}

// ─── Full table render ────────────────────────────────────────────────────────

/**
 * Re-render the table body for the current page.
 */
function renderTableBody() {
  const tbody  = document.getElementById('txn-table-body');
  const badge  = document.getElementById('table-count-badge');
  if (!tbody) return;

  const { filtered, page, pageSize } = TableState;
  const start  = (page - 1) * pageSize;
  const end    = start + pageSize;
  const slice  = filtered.slice(start, end);

  if (slice.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-12 text-ink-muted text-sm">
          No transactions match the current filters.
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = slice.map(buildRow).join('');
  }

  // Update count badge
  if (badge) badge.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

  renderPagination();
}

// ─── Full refresh (filter + render) ─────────────────────────────────────────

function refreshTable() {
  applyFilters();
  renderTableBody();
  updateClearButton();
}

// ─── Filter controls setup ────────────────────────────────────────────────────

/**
 * Populate the category and month <select> dropdowns from AppData.
 */
function populateFilterOptions() {
  const catSelect   = document.getElementById('filter-category');
  const monthSelect = document.getElementById('filter-month');
  if (!catSelect || !monthSelect) return;

  // Categories
  AppData.categories.forEach(cat => {
    const opt     = document.createElement('option');
    opt.value     = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });

  // Months (formatted labels)
  AppData.months.forEach(key => {
    const opt       = document.createElement('option');
    opt.value       = key;
    opt.textContent = monthKeyToLabel(key);
    monthSelect.appendChild(opt);
  });
}

/**
 * Wire up all filter control event listeners.
 */
function bindFilterControls() {
  // Debounced search
  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        TableState.search = searchInput.value.trim();
        refreshTable();
      }, 220);
    });
  }

  // Category select
  const catSelect = document.getElementById('filter-category');
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      TableState.category = catSelect.value;
      refreshTable();
    });
  }

  // Month select
  const monthSelect = document.getElementById('filter-month');
  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      TableState.month = monthSelect.value;
      refreshTable();
    });
  }

  // Anomaly toggle
  const anomalyToggle = document.getElementById('filter-anomaly');
  if (anomalyToggle) {
    anomalyToggle.addEventListener('click', () => {
      const checked = anomalyToggle.getAttribute('aria-checked') === 'true';
      anomalyToggle.setAttribute('aria-checked', String(!checked));
      TableState.anomalyOnly = !checked;
      refreshTable();
    });
  }

  // Sortable columns
  document.querySelectorAll('.txn-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (TableState.sortCol === col) {
        TableState.sortDir = TableState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        TableState.sortCol = col;
        TableState.sortDir = 'asc';
      }
      // Update header classes
      document.querySelectorAll('.txn-table th.sortable').forEach(h => {
        h.classList.remove('sorted', 'asc', 'desc');
      });
      th.classList.add('sorted', TableState.sortDir);
      refreshTable();
    });
  });

  // Page size
  const pageSizeSelect = document.getElementById('page-size');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      TableState.pageSize = parseInt(pageSizeSelect.value, 10);
      refreshTable();
    });
  }

  // Pagination nav (event delegation)
  const paginationNav = document.getElementById('pagination-nav');
  if (paginationNav) {
    paginationNav.addEventListener('click', e => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      const newPage = parseInt(btn.dataset.page, 10);
      const maxPage = Math.ceil(TableState.filtered.length / TableState.pageSize);
      if (newPage < 1 || newPage > maxPage) return;
      TableState.page = newPage;
      renderTableBody();
    });
  }

  // Clear filters button
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearFilters);
  }
}

/**
 * Reset all filters to defaults.
 */
function clearFilters() {
  TableState.search      = '';
  TableState.category    = '';
  TableState.month       = '';
  TableState.anomalyOnly = false;

  const searchInput = document.getElementById('filter-search');
  if (searchInput) searchInput.value = '';

  const catSelect = document.getElementById('filter-category');
  if (catSelect) catSelect.value = '';

  const monthSelect = document.getElementById('filter-month');
  if (monthSelect) monthSelect.value = '';

  const toggle = document.getElementById('filter-anomaly');
  if (toggle) toggle.setAttribute('aria-checked', 'false');

  refreshTable();
}

/**
 * Show/hide the "clear filters" button based on whether any filter is active.
 */
function updateClearButton() {
  const btn = document.getElementById('clear-filters-btn');
  if (!btn) return;
  const active = TableState.search || TableState.category
              || TableState.month  || TableState.anomalyOnly;
  btn.classList.toggle('hidden', !active);
}

// ─── Public init ──────────────────────────────────────────────────────────────

/**
 * Initialize the transactions table.
 * Call after AppData and Analytics are populated.
 */
function initTable() {
  populateFilterOptions();
  bindFilterControls();
  refreshTable();

  // Set initial sort indicator
  const dateTh = document.querySelector('.txn-table th[data-sort="date"]');
  if (dateTh) dateTh.classList.add('sorted', 'asc');
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Escape HTML special chars to prevent XSS from description field.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
