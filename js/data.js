/**
 * js/data.js — CSV loader & data model
 *
 * Responsibilities:
 *  - Fetch and parse dataset.csv (relative path)
 *  - Normalize rows into typed Transaction objects
 *  - Expose a singleton `AppData` with derived lookup maps
 *
 * No external dependencies. Loaded first in the script chain.
 */

'use strict';

// ─── Types (JSDoc for IDE support) ──────────────────────────────────────────

/**
 * @typedef {Object} Transaction
 * @property {number}  idx         — original row index from CSV
 * @property {Date}    date        — parsed Date object
 * @property {string}  dateStr     — ISO date string "YYYY-MM-DD"
 * @property {string}  monthKey    — "YYYY-MM" for grouping
 * @property {string}  monthLabel  — "Jan 2023" for display
 * @property {string}  description
 * @property {number}  amount      — float, USD
 * @property {string}  category
 * @property {string}  label
 * @property {boolean} isAnomaly   — set by analytics module
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Path to the CSV file, relative to index.html */
const CSV_PATH = 'dataset.csv';

/** Short month-name lookup */
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── CSV parser ──────────────────────────────────────────────────────────────

/**
 * Minimal RFC-4180-compatible CSV parser.
 * Returns an array of objects keyed by the header row.
 *
 * @param {string} text — raw CSV string
 * @returns {Object[]}
 */
function parseCSV(text) {
  const lines  = text.trim().split(/\r?\n/);
  const headers = splitLine(lines[0]);
  const rows    = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = splitLine(line);
    const row    = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? '').trim(); });
    rows.push(row);
  }

  return rows;
}

/**
 * Split one CSV line, respecting quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
function splitLine(line) {
  const fields = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ─── Row normalizer ──────────────────────────────────────────────────────────

/**
 * Convert a raw CSV row into a typed Transaction.
 * Returns null for rows with invalid/missing required fields.
 *
 * @param {Object} row
 * @returns {Transaction|null}
 */
function normalizeRow(row) {
  const idx    = parseInt(row.idx,  10);
  const amount = parseFloat(row.amount);
  const date   = new Date(row.date);

  // Validate required fields
  if (isNaN(idx) || isNaN(amount) || isNaN(date.getTime())) return null;
  if (!row.description || !row.category) return null;

  const y         = date.getFullYear();
  const m         = date.getMonth();       // 0-based
  const d         = date.getDate();
  const pad       = n => String(n).padStart(2, '0');
  const dateStr   = `${y}-${pad(m + 1)}-${pad(d)}`;
  const monthKey  = `${y}-${pad(m + 1)}`;
  const monthLabel= `${MONTH_NAMES[m]} ${y}`;

  return {
    idx,
    date,
    dateStr,
    monthKey,
    monthLabel,
    description: row.description.trim(),
    amount,
    category:    row.category.trim(),
    label:       row.label?.trim() ?? row.category.trim(),
    isAnomaly:   false,   // populated later by analytics.js
  };
}

// ─── Singleton data store ────────────────────────────────────────────────────

/**
 * AppData — populated after loadData() resolves.
 * All other modules read from this object.
 */
const AppData = {
  /** @type {Transaction[]} All valid transactions, sorted by date */
  transactions: [],

  /** @type {string[]} Distinct sorted categories */
  categories: [],

  /** @type {string[]} Distinct sorted month keys "YYYY-MM" */
  months: [],

  /** @type {Map<string, Transaction[]>} Transactions grouped by monthKey */
  byMonth: new Map(),

  /** @type {Map<string, Transaction[]>} Transactions grouped by category */
  byCategory: new Map(),

  /** @type {number} Sum of all amounts */
  totalAmount: 0,

  /** @type {number} Number of transactions */
  count: 0,
};

// ─── Public loader ───────────────────────────────────────────────────────────

/**
 * Fetch, parse, and populate AppData.
 * Returns a resolved Promise on success, rejected on network/parse failure.
 *
 * @returns {Promise<void>}
 */
async function loadData() {
  let text;
  try {
    const response = await fetch(CSV_PATH);
    if (!response.ok) throw new Error(`HTTP ${response.status} – ${response.statusText}`);
    text = await response.text();
  } catch (err) {
    throw new Error(`Could not fetch dataset.csv: ${err.message}`);
  }

  const rows        = parseCSV(text);
  const transactions = rows
    .map(normalizeRow)
    .filter(Boolean)                           // drop invalid rows
    .sort((a, b) => a.date - b.date);         // chronological order

  if (transactions.length === 0) {
    throw new Error('dataset.csv contains no valid transactions.');
  }

  // ── Populate lookup maps ──
  const byMonth    = new Map();
  const byCategory = new Map();
  let   total      = 0;

  for (const txn of transactions) {
    // By month
    if (!byMonth.has(txn.monthKey)) byMonth.set(txn.monthKey, []);
    byMonth.get(txn.monthKey).push(txn);

    // By category
    if (!byCategory.has(txn.category)) byCategory.set(txn.category, []);
    byCategory.get(txn.category).push(txn);

    total += txn.amount;
  }

  // Sorted unique lists
  const categories = [...byCategory.keys()].sort();
  const months     = [...byMonth.keys()].sort();

  // Write to singleton
  AppData.transactions = transactions;
  AppData.categories   = categories;
  AppData.months       = months;
  AppData.byMonth      = byMonth;
  AppData.byCategory   = byCategory;
  AppData.totalAmount  = total;
  AppData.count        = transactions.length;
}

// ─── Utility helpers (used by other modules) ─────────────────────────────────

/**
 * Format a number as USD currency string.
 * @param {number} n
 * @param {boolean} [compact] — use K/M suffix for large values
 * @returns {string}
 */
function formatCurrency(n, compact = false) {
  if (compact && n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (compact && n >= 10_000)    return `$${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Convert a "YYYY-MM" month key to a short display label.
 * @param {string} key
 * @returns {string}  e.g. "Jan 2023"
 */
function monthKeyToLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

/**
 * Returns the median of a numeric array.
 * @param {number[]} arr — must be non-empty
 * @returns {number}
 */
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Returns the sample standard deviation of a numeric array.
 * @param {number[]} arr
 * @returns {number}
 */
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
