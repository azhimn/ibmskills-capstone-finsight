/**
 * js/main.js — Application bootstrap
 *
 * Entry point. Executed last in the script chain.
 * Coordinates: data loading → analytics → UI render → charts → table.
 *
 * Dependency load order (enforced by HTML script tags):
 *   data.js → analytics.js → charts.js → table.js → ui.js → main.js
 */

'use strict';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Show loading spinner
  showLoading();
  initUI();   // wire tabs & mobile menu immediately (before data)

  try {
    // 2. Fetch & parse CSV
    await loadData();

    // 3. Run statistical analysis (mutates transactions with isAnomaly)
    runAnalytics();

    // 4. Show dashboard skeleton
    showDashboard();

    // 5. Render all UI panels (KPIs, anomaly list, strategy, summary table)
    renderUI();

    // 6. Render Chart.js charts
    renderAllCharts();

    // 7. Initialize the transactions table
    initTable();

  } catch (err) {
    console.error('[FinSight] Bootstrap error:', err);
    showError(err.message ?? 'An unexpected error occurred. Check the console for details.');
  }
});
