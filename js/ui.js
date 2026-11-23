/**
 * js/ui.js — UI orchestration layer
 *
 * Responsibilities:
 *  - Tab switching (Overview / Analysis / Transactions)
 *  - Mobile menu toggle
 *  - Loading / error state management
 *  - KPI card population
 *  - Analysis panel rendering (anomalies, saving strategy, summary table)
 *  - Data freshness badge
 *
 * Does NOT modify AppData or Analytics.
 */

'use strict';

// ─── Tab switching ────────────────────────────────────────────────────────────

/**
 * Wire up tab buttons (desktop nav + mobile menu).
 * Shows the matching section, hides the rest.
 */
function initTabs() {
  const sections = document.querySelectorAll('[data-section]');

  function switchTab(tabName) {
    // Update all tab buttons (desktop + mobile)
    document.querySelectorAll('[data-tab]').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    // Show/hide sections
    sections.forEach(section => {
      const isVisible = section.dataset.section === tabName;
      section.classList.toggle('hidden', !isVisible);
    });

    // Close mobile menu on tab select
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileBtn  = document.getElementById('mobile-menu-btn');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('hidden');
      mobileBtn?.setAttribute('aria-expanded', 'false');
    }
  }

  // Bind all tab buttons
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Default tab on load
  switchTab('overview');
}

// ─── Mobile menu ─────────────────────────────────────────────────────────────

function initMobileMenu() {
  const btn  = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!open));
  });
}

// ─── Loading / error states ───────────────────────────────────────────────────

function showLoading() {
  document.getElementById('loading-state')?.classList.remove('hidden');
  document.getElementById('error-state')?.classList.add('hidden');
  document.getElementById('dashboard-content')?.classList.add('hidden');
}

function showError(message) {
  document.getElementById('loading-state')?.classList.add('hidden');
  document.getElementById('error-state')?.classList.remove('hidden');
  document.getElementById('dashboard-content')?.classList.add('hidden');

  const detail = document.getElementById('error-detail');
  if (detail) detail.textContent = message;
}

function showDashboard() {
  document.getElementById('loading-state')?.classList.add('hidden');
  document.getElementById('error-state')?.classList.add('hidden');
  document.getElementById('dashboard-content')?.classList.remove('hidden');
}

// ─── Data badge ───────────────────────────────────────────────────────────────

/**
 * Update the top-right data freshness badge.
 * @param {string} label
 */
function setDataBadge(label) {
  const badge = document.getElementById('data-badge');
  const text  = document.getElementById('data-badge-label');
  if (badge) badge.classList.remove('hidden');
  if (text)  text.textContent = label;
}

// ─── KPI cards ────────────────────────────────────────────────────────────────

/**
 * Populate the four KPI cards from Analytics.overview.
 */
function renderKPIs() {
  const ov = Analytics.overview;

  set('kpi-total',         formatCurrency(ov.total));
  set('kpi-total-sub',     `${ov.count} transactions  ·  ${ov.dateRange.from} → ${ov.dateRange.to}`);

  set('kpi-avg-monthly',   formatCurrency(ov.avgMonthly));
  set('kpi-avg-monthly-sub', `Over ${AppData.months.length} month${AppData.months.length > 1 ? 's' : ''}`);

  set('kpi-avg-txn',       formatCurrency(ov.avgTxn));
  set('kpi-avg-txn-sub',   `Range: ${formatCurrency(ov.minTxn)} – ${formatCurrency(ov.maxTxn)}`);

  set('kpi-anomalies',     String(ov.anomalyCount));
  set('kpi-anomalies-sub', `${ov.anomalyCount > 0 ? 'See Analysis tab for details' : 'No anomalies found'}`);

  function set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
}

// ─── Anomaly panel ────────────────────────────────────────────────────────────

/**
 * Render the anomaly insight cards in #anomaly-list.
 */
function renderAnomalyPanel() {
  const container = document.getElementById('anomaly-list');
  if (!container) return;

  const anomalies = Analytics.anomalies;

  if (anomalies.length === 0) {
    container.innerHTML = `
      <div class="flex items-center gap-3 py-6 text-ink-muted">
        <svg class="w-5 h-5 text-teal-400 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/>
        </svg>
        <p class="text-sm">No anomalous transactions detected in this dataset.</p>
      </div>`;
    return;
  }

  container.innerHTML = anomalies.map(txn => {
    const reason = txn._iqrFlagged && txn._zFlagged
      ? 'IQR fence + Z-score'
      : txn._iqrFlagged ? 'IQR fence exceeded'
      : `Z-score ${txn._zScore}σ`;

    return `
      <div class="anomaly-item" role="listitem">
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <p class="text-sm font-medium text-ink truncate">${escapeHtml(txn.description)}</p>
            <p class="text-sm font-semibold tabnum text-rose-400 shrink-0">${formatCurrency(txn.amount)}</p>
          </div>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <span class="text-xs text-ink-muted tabnum">${txn.dateStr}</span>
            <span class="text-ink-faint">·</span>
            <span class="cat-pill text-xs" style="${catPillStyle(txn.category)}">${escapeHtml(txn.category)}</span>
            <span class="text-ink-faint">·</span>
            <span class="anomaly-badge">${reason}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ─── Saving strategy panel ────────────────────────────────────────────────────

/** Icon SVG paths for each strategy type */
const STRATEGY_ICONS = {
  cut: `<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>`,
  subscription: `<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>`,
  alert: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>`,
  entertainment: `<path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m17.25 2.625h-1.5c-.621 0-1.125-.504-1.125-1.125M21 19.5V5.625M21 5.625A2.625 2.625 0 0018.375 3h-12.75A2.625 2.625 0 003 5.625m18 0v1.5c0 .621-.504 1.125-1.125 1.125M3 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h15.75"/>`,
  food: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5"/>`,
  savings: `<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75"/>`,
};

const PRIORITY_BADGE = {
  high:   'bg-rose-400/10 text-rose-400 border border-rose-400/20',
  medium: 'bg-amber-400/10 text-amber-400 border border-amber-400/20',
  low:    'bg-teal-400/10 text-teal-400 border border-teal-400/20',
};

/**
 * Render the saving strategy recommendations in #saving-strategy.
 */
function renderSavingStrategy() {
  const container = document.getElementById('saving-strategy');
  if (!container) return;

  const strategies = Analytics.savingStrategy;

  if (strategies.length === 0) {
    container.innerHTML = `<p class="text-ink-muted text-sm py-4">No specific recommendations generated for this dataset.</p>`;
    return;
  }

  container.innerHTML = strategies.map((s, i) => {
    const iconPath = STRATEGY_ICONS[s.icon] || STRATEGY_ICONS.savings;
    const badge    = PRIORITY_BADGE[s.priority] || PRIORITY_BADGE.low;

    return `
      <div class="strategy-card" role="listitem">
        <div class="strategy-icon" aria-hidden="true">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
            ${iconPath}
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <p class="text-sm font-semibold text-ink">${escapeHtml(s.title)}</p>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium ${badge} uppercase tracking-wide">${s.priority}</span>
              <span class="text-xs text-teal-400 font-semibold tabnum">~${formatCurrency(s.saving, true)} savings</span>
            </div>
          </div>
          <p class="text-xs text-ink-muted mt-1 leading-relaxed">${escapeHtml(s.detail)}</p>
        </div>
      </div>`;
  }).join('');
}

// ─── Summary table ────────────────────────────────────────────────────────────

/**
 * Render the category expenses summary table in #summary-table-body.
 */
function renderSummaryTable() {
  const tbody = document.getElementById('summary-table-body');
  if (!tbody) return;

  const stats = Analytics.categoryStats;
  const maxShare = Math.max(...stats.map(s => s.share));

  tbody.innerHTML = stats.map(s => {
    const color   = getCatColor(s.category);
    const barWidth = maxShare > 0 ? (s.share / maxShare) * 100 : 0;

    return `
      <tr>
        <td>
          <span class="cat-pill" style="${catPillStyle(s.category)}">${escapeHtml(s.category)}</span>
        </td>
        <td class="text-right tabnum">${s.count}</td>
        <td class="text-right tabnum font-semibold text-ink">${formatCurrency(s.total)}</td>
        <td class="text-right tabnum">${formatCurrency(s.avg)}</td>
        <td class="text-right tabnum text-ink-muted">${formatCurrency(s.min)}</td>
        <td class="text-right tabnum text-ink-muted">${formatCurrency(s.max)}</td>
        <td>
          <div class="share-bar">
            <div class="share-track">
              <div class="share-fill" style="width:${barWidth.toFixed(1)}%; background:${color};" aria-hidden="true"></div>
            </div>
            <span class="share-pct">${s.share.toFixed(1)}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ─── Full UI render ───────────────────────────────────────────────────────────

/**
 * Render all UI panels from Analytics data.
 * Called once after Analytics.runAnalytics() completes.
 */
function renderUI() {
  renderKPIs();
  renderAnomalyPanel();
  renderSavingStrategy();
  renderSummaryTable();
  setDataBadge(`${AppData.count} transactions loaded`);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Wire up non-data UI: tabs, mobile menu.
 * Call once on DOMContentLoaded.
 */
function initUI() {
  initTabs();
  initMobileMenu();
}
