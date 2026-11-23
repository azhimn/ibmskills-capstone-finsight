/**
 * js/analytics.js — Statistical analysis engine
 *
 * Responsibilities:
 *  - Anomaly detection (IQR fencing + Z-score dual method)
 *  - Category & monthly statistics
 *  - Saving strategy generation
 *  - Expenses summary table data
 *
 * Reads from AppData (populated by data.js).
 * Writes `isAnomaly` back onto Transaction objects.
 */

'use strict';

// ─── Analytics singleton ──────────────────────────────────────────────────────

/**
 * Analytics — populated after runAnalytics() is called.
 * All UI modules read from here.
 */
const Analytics = {
  /** @type {Transaction[]} Transactions flagged as anomalies */
  anomalies: [],

  /** @type {Object[]} Per-category statistics */
  categoryStats: [],

  /** @type {Object[]} Per-month statistics */
  monthlyStats: [],

  /** @type {Object} Overall statistics */
  overview: {},

  /** @type {Object[]} Saving strategy recommendations */
  savingStrategy: [],

  /** IQR fence upper bound (for chart threshold line) */
  iqrUpperFence: 0,

  /** Z-score threshold value */
  zScoreThreshold: 2.5,
};

// ─── Anomaly detection ────────────────────────────────────────────────────────

/**
 * Detect anomalies using a dual-method approach:
 *   1. IQR fencing: amount > Q3 + 1.5 × IQR
 *   2. Z-score:     |z| > 2.5  (more sensitive for smaller samples)
 *
 * A transaction is flagged if EITHER method triggers.
 * This catches both classic outliers and near-gaussian extremes.
 *
 * @param {Transaction[]} transactions
 */
function detectAnomalies(transactions) {
  const amounts = transactions.map(t => t.amount);
  const n       = amounts.length;

  // ── IQR method ──
  const sorted = [...amounts].sort((a, b) => a - b);
  const q1     = percentile(sorted, 25);
  const q3     = percentile(sorted, 75);
  const iqr    = q3 - q1;
  const upper  = q3 + 1.5 * iqr;
  const lower  = q1 - 1.5 * iqr;   // rarely triggers for expenses

  // ── Z-score method ──
  const mean   = amounts.reduce((s, v) => s + v, 0) / n;
  const sd     = stdDev(amounts);
  const zThresh = Analytics.zScoreThreshold;

  // Flag each transaction
  for (const txn of transactions) {
    const iqrFlag    = txn.amount > upper || txn.amount < lower;
    const zScore     = sd > 0 ? Math.abs((txn.amount - mean) / sd) : 0;
    const zFlag      = zScore > zThresh;

    txn.isAnomaly    = iqrFlag || zFlag;
    txn._zScore      = +zScore.toFixed(2);
    txn._iqrFlagged  = iqrFlag;
    txn._zFlagged    = zFlag;
  }

  Analytics.iqrUpperFence = upper;
  Analytics.anomalies     = transactions.filter(t => t.isAnomaly)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Returns the value at a given percentile of a sorted array.
 * Uses linear interpolation.
 *
 * @param {number[]} sorted — ascending sorted array
 * @param {number}   p      — percentile 0–100
 * @returns {number}
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─── Category statistics ──────────────────────────────────────────────────────

/**
 * Compute per-category stats: total, avg, min, max, count, share.
 *
 * @param {Transaction[]} transactions
 * @param {number} grandTotal
 * @returns {Object[]}
 */
function computeCategoryStats(transactions, grandTotal) {
  const stats = [];

  for (const [category, txns] of AppData.byCategory) {
    const amounts = txns.map(t => t.amount);
    const total   = amounts.reduce((s, v) => s + v, 0);
    const avg     = total / amounts.length;
    const min     = Math.min(...amounts);
    const max     = Math.max(...amounts);
    const count   = amounts.length;
    const share   = grandTotal > 0 ? (total / grandTotal) * 100 : 0;

    stats.push({ category, count, total, avg, min, max, share });
  }

  // Sort by total descending
  return stats.sort((a, b) => b.total - a.total);
}

// ─── Monthly statistics ───────────────────────────────────────────────────────

/**
 * Compute per-month spending totals and transaction counts.
 *
 * @returns {Object[]}
 */
function computeMonthlyStats() {
  const stats = [];

  for (const [monthKey, txns] of AppData.byMonth) {
    const amounts = txns.map(t => t.amount);
    const total   = amounts.reduce((s, v) => s + v, 0);
    const count   = txns.length;
    const label   = monthKeyToLabel(monthKey);

    stats.push({ monthKey, label, total, count });
  }

  return stats.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

// ─── Overview stats ───────────────────────────────────────────────────────────

/**
 * Compute high-level overview numbers for the KPI row.
 *
 * @param {Transaction[]} transactions
 * @param {Object[]} monthlyStats
 * @returns {Object}
 */
function computeOverview(transactions, monthlyStats) {
  const amounts     = transactions.map(t => t.amount);
  const total       = amounts.reduce((s, v) => s + v, 0);
  const count       = amounts.length;
  const avgTxn      = total / count;
  const monthTotals = monthlyStats.map(m => m.total);
  const avgMonthly  = monthTotals.reduce((s, v) => s + v, 0) / monthTotals.length;
  const maxTxn      = Math.max(...amounts);
  const minTxn      = Math.min(...amounts);
  const topCategory = AppData.categories.reduce((best, cat) => {
    const catTotal = AppData.byCategory.get(cat)
      .reduce((s, t) => s + t.amount, 0);
    return catTotal > best.total ? { name: cat, total: catTotal } : best;
  }, { name: '', total: 0 });

  return {
    total,
    count,
    avgTxn,
    avgMonthly,
    maxTxn,
    minTxn,
    anomalyCount: transactions.filter(t => t.isAnomaly).length,
    topCategory,
    dateRange: {
      from: transactions[0].dateStr,
      to:   transactions[transactions.length - 1].dateStr,
    },
  };
}

// ─── Saving strategy ─────────────────────────────────────────────────────────

/**
 * Generate rule-based saving strategy recommendations.
 * Uses category stats, anomaly data, and spending patterns.
 *
 * @param {Object[]} categoryStats
 * @param {Object}   overview
 * @param {Transaction[]} transactions
 * @returns {Object[]} Array of recommendation objects
 */
function generateSavingStrategy(categoryStats, overview, transactions) {
  const strategies = [];
  const total      = overview.total;

  // ── 1. High-spend category reduction ──
  categoryStats.slice(0, 3).forEach(cat => {
    if (cat.share >= 15) {
      const potentialSave = cat.total * 0.15;
      strategies.push({
        icon: 'cut',
        priority: 'high',
        title: `Reduce ${cat.category} spending`,
        detail: `${cat.category} accounts for ${cat.share.toFixed(1)}% of total spend (${formatCurrency(cat.total)}). `
              + `A 15% reduction could save ${formatCurrency(potentialSave)} over this period.`,
        saving: potentialSave,
      });
    }
  });

  // ── 2. Subscription audit ──
  const subs = AppData.byCategory.get('Subscriptions');
  if (subs && subs.length > 0) {
    const subTotal = subs.reduce((s, t) => s + t.amount, 0);
    const subShare = (subTotal / total) * 100;
    if (subShare > 2 || subs.length > 4) {
      strategies.push({
        icon: 'subscription',
        priority: 'medium',
        title: 'Audit recurring subscriptions',
        detail: `You have ${subs.length} subscription entries totaling ${formatCurrency(subTotal)}. `
              + `Review for unused or duplicate services — consolidating could free up ${formatCurrency(subTotal * 0.3)} or more.`,
        saving: subTotal * 0.3,
      });
    }
  }

  // ── 3. Anomaly-driven alert ──
  if (Analytics.anomalies.length > 0) {
    const anomalyTotal = Analytics.anomalies.reduce((s, t) => s + t.amount, 0);
    strategies.push({
      icon: 'alert',
      priority: 'high',
      title: 'Investigate anomalous transactions',
      detail: `${Analytics.anomalies.length} transaction(s) are statistical outliers, totaling ${formatCurrency(anomalyTotal)}. `
            + `Verifying these are legitimate and expected could reveal billing errors or one-time costs to avoid.`,
      saving: anomalyTotal * 0.2,  // conservative: assume 20% preventable
    });
  }

  // ── 4. Entertainment rationalization ──
  const ent = AppData.byCategory.get('Entertainment');
  if (ent && ent.length > 0) {
    const entTotal = ent.reduce((s, t) => s + t.amount, 0);
    const entShare = (entTotal / total) * 100;
    if (entShare > 5) {
      strategies.push({
        icon: 'entertainment',
        priority: 'medium',
        title: 'Cap discretionary entertainment',
        detail: `Entertainment represents ${entShare.toFixed(1)}% of spend (${formatCurrency(entTotal)}). `
              + `Setting a monthly cap could recover ${formatCurrency(entTotal * 0.2)}.`,
        saving: entTotal * 0.2,
      });
    }
  }

  // ── 5. Food optimization ──
  const food = AppData.byCategory.get('Food');
  if (food && food.length > 0) {
    const foodTotal     = food.reduce((s, t) => s + t.amount, 0);
    const foodShare     = (foodTotal / total) * 100;
    const diningOut     = food.filter(t =>
      /restaurant|dinner|lunch|pizza|cafe|coffee|sandwich/i.test(t.description)
    );
    const diningTotal   = diningOut.reduce((s, t) => s + t.amount, 0);
    const diningShare   = foodTotal > 0 ? (diningTotal / foodTotal) * 100 : 0;

    if (diningShare > 30 && foodShare > 5) {
      strategies.push({
        icon: 'food',
        priority: 'low',
        title: 'Shift from dining out to home cooking',
        detail: `~${diningShare.toFixed(0)}% of food spend appears to be dining out (${formatCurrency(diningTotal)}). `
              + `Preparing meals at home for 40% of those occasions could save approximately ${formatCurrency(diningTotal * 0.4)}.`,
        saving: diningTotal * 0.4,
      });
    }
  }

  // ── 6. Emergency fund recommendation ──
  const monthlyStats = Analytics.monthlyStats;
  if (monthlyStats.length >= 2) {
    const monthTotals  = monthlyStats.map(m => m.total);
    const avgMonthly   = monthTotals.reduce((s, v) => s + v, 0) / monthTotals.length;
    const recommended  = avgMonthly * 3;  // 3-month emergency fund
    strategies.push({
      icon: 'savings',
      priority: 'low',
      title: 'Build a 3-month emergency fund',
      detail: `Your average monthly spend is ${formatCurrency(avgMonthly)}. A standard 3-month emergency reserve would be `
            + `${formatCurrency(recommended)}. Setting aside 10% of monthly spend builds this in ~30 months.`,
      saving: avgMonthly * 0.1,
    });
  }

  // Sort by priority: high → medium → low, then by estimated saving desc
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return strategies
    .sort((a, b) => {
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
      return pd !== 0 ? pd : b.saving - a.saving;
    });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run all analytics over AppData.
 * Must be called after loadData() resolves.
 */
function runAnalytics() {
  const { transactions, totalAmount } = AppData;

  // 1. Anomaly detection (mutates transactions)
  detectAnomalies(transactions);

  // 2. Category stats
  const categoryStats = computeCategoryStats(transactions, totalAmount);
  Analytics.categoryStats = categoryStats;

  // 3. Monthly stats
  const monthlyStats = computeMonthlyStats();
  Analytics.monthlyStats = monthlyStats;

  // 4. Overview
  const overview = computeOverview(transactions, monthlyStats);
  Analytics.overview = overview;

  // 5. Saving strategy
  Analytics.savingStrategy = generateSavingStrategy(categoryStats, overview, transactions);
}
