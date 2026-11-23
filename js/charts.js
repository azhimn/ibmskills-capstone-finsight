/**
 * js/charts.js — Chart.js chart renderers
 *
 * Responsibilities:
 *  - Register Chart.js annotation plugin
 *  - Configure global Chart.js defaults for the dark theme
 *  - Render all five charts:
 *      1. Monthly spending (bar)
 *      2. Category breakdown (donut)
 *      3. Category frequency (horizontal bar)
 *      4. Average expense by category (bar)
 *      5. Transaction timeline (scatter, anomalies highlighted)
 *  - Expose `Charts` singleton for later updates/destroy
 *
 * Reads from AppData and Analytics (populated before charts render).
 */

'use strict';

// ─── Color palette (matches style.css tokens) ────────────────────────────────

const PALETTE = {
  teal:    '#2dd4bf',
  amber:   '#fbbf24',
  rose:    '#fb7185',
  violet:  '#a78bfa',
  sky:     '#38bdf8',
  emerald: '#34d399',
  orange:  '#fb923c',
  pink:    '#f472b6',
  lime:    '#a3e635',
  cyan:    '#22d3ee',
  indigo:  '#818cf8',
  yellow:  '#facc15',
};

/** Ordered palette for sequential category colouring */
const CAT_COLORS = [
  PALETTE.teal,
  PALETTE.sky,
  PALETTE.violet,
  PALETTE.amber,
  PALETTE.rose,
  PALETTE.emerald,
  PALETTE.orange,
  PALETTE.pink,
  PALETTE.lime,
  PALETTE.cyan,
  PALETTE.indigo,
  PALETTE.yellow,
];

/** Map category name → color (stable across renders) */
const catColorMap = new Map();
function getCatColor(category) {
  if (!catColorMap.has(category)) {
    const idx = catColorMap.size % CAT_COLORS.length;
    catColorMap.set(category, CAT_COLORS[idx]);
  }
  return catColorMap.get(category);
}

// ─── Global Chart.js defaults ─────────────────────────────────────────────────

function applyChartDefaults() {
  // Register the annotation plugin (required for Chart.js v4)
  if (typeof window.ChartAnnotation !== 'undefined') {
    Chart.register(window.ChartAnnotation);
  }
  Chart.defaults.color                    = '#7d8590';
  Chart.defaults.borderColor              = '#21262d';
  Chart.defaults.font.family              = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size                = 11;
  Chart.defaults.plugins.legend.display   = false;    // we use custom legends
  Chart.defaults.plugins.tooltip.padding  = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.plugins.tooltip.backgroundColor = '#21262d';
  Chart.defaults.plugins.tooltip.borderColor     = '#3d444d';
  Chart.defaults.plugins.tooltip.borderWidth     = 1;
  Chart.defaults.plugins.tooltip.titleColor       = '#e6edf3';
  Chart.defaults.plugins.tooltip.bodyColor        = '#c9d1d9';
  Chart.defaults.plugins.tooltip.titleFont        = { weight: '600', size: 12 };
  Chart.defaults.animation.duration               = 500;
  Chart.defaults.animation.easing                 = 'easeOutQuart';
  Chart.defaults.responsive                        = true;
  Chart.defaults.maintainAspectRatio               = false;
}

// ─── Chart registry ───────────────────────────────────────────────────────────

/** Charts — holds Chart.js instances keyed by ID, for cleanup */
const Charts = {};

/**
 * Safely destroy a chart if it already exists on a canvas.
 * @param {string} id — canvas element id
 */
function destroyChart(id) {
  if (Charts[id]) {
    Charts[id].destroy();
    delete Charts[id];
  }
}

// ─── 1. Monthly spending bar chart ───────────────────────────────────────────

/**
 * Bar chart: monthly spending total, with annotation line for average.
 */
function renderMonthlyChart() {
  destroyChart('chart-monthly');
  const ctx   = document.getElementById('chart-monthly');
  if (!ctx) return;

  const stats  = Analytics.monthlyStats;
  const labels = stats.map(m => m.label);
  const data   = stats.map(m => m.total);
  const avg    = data.reduce((s, v) => s + v, 0) / data.length;

  // Color bars: above average → rose tint, normal → teal
  const bgColors = data.map(v =>
    v > avg * 1.3 ? `${PALETTE.rose}cc`
    : v > avg      ? `${PALETTE.teal}cc`
    :                `${PALETTE.sky}99`
  );

  Charts['chart-monthly'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Total Spend',
        data,
        backgroundColor: bgColors,
        borderColor:     bgColors.map(c => c.replace(/cc|99/, 'ff')),
        borderWidth:     1,
        borderRadius:    4,
        borderSkipped:   false,
      }],
    },
    options: {
      scales: {
        x: {
          grid:   { display: false },
          ticks:  { color: '#7d8590', maxRotation: 0 },
        },
        y: {
          grid:   { color: '#21262d' },
          ticks:  {
            color: '#7d8590',
            callback: v => formatCurrency(v, true),
          },
          beginAtZero: true,
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed.y)}  (${stats[ctx.dataIndex].count} txns)`,
          },
        },
        annotation: {
          annotations: {
            avgLine: {
              type:        'line',
              yMin:        avg,
              yMax:        avg,
              borderColor: `${PALETTE.amber}99`,
              borderWidth: 1.5,
              borderDash:  [5, 4],
              label: {
                display:    true,
                content:    `Avg ${formatCurrency(avg, true)}`,
                position:   'end',
                color:      PALETTE.amber,
                font:       { size: 10, weight: '500' },
                backgroundColor: 'transparent',
                yAdjust:    -8,
              },
            },
          },
        },
      },
    },
  });
}

// ─── 2. Category donut chart ──────────────────────────────────────────────────

/**
 * Donut chart: category spending share.
 * Includes a custom centre-text plugin.
 */
function renderCategoryDonut() {
  destroyChart('chart-category-donut');
  const ctx = document.getElementById('chart-category-donut');
  if (!ctx) return;

  const stats  = Analytics.categoryStats;
  const labels = stats.map(s => s.category);
  const data   = stats.map(s => s.total);
  const colors = labels.map(getCatColor);

  // Custom centre-text plugin (scoped, not global registration)
  const centreTextPlugin = {
    id: 'centreText',
    afterDraw(chart) {
      const { ctx: c, chartArea: { top, bottom, left, right } } = chart;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      c.save();
      c.textAlign    = 'center';
      c.textBaseline = 'middle';
      c.fillStyle    = '#e6edf3';
      c.font         = `600 15px Inter, system-ui, sans-serif`;
      c.fillText(formatCurrency(AppData.totalAmount, true), cx, cy - 8);
      c.fillStyle = '#7d8590';
      c.font      = `400 10px Inter, system-ui, sans-serif`;
      c.fillText('total spend', cx, cy + 8);
      c.restore();
    },
  };

  Charts['chart-category-donut'] = new Chart(ctx, {
    type:    'doughnut',
    plugins: [centreTextPlugin],
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => `${c}cc`),
        borderColor:     colors,
        borderWidth:     2,
        hoverOffset:     8,
        hoverBorderWidth: 3,
      }],
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: {
          display:  true,
          position: 'bottom',
          labels:   {
            padding:    12,
            boxWidth:   10,
            boxHeight:  10,
            borderRadius: 3,
            color:      '#c9d1d9',
            font:       { size: 10 },
            usePointStyle: true,
            pointStyle:    'rectRounded',
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)} (${((ctx.parsed / AppData.totalAmount) * 100).toFixed(1)}%)`,
          },
        },
      },
    },
  });
}

// ─── 3. Category frequency horizontal bar ────────────────────────────────────

/**
 * Horizontal bar: number of transactions per category.
 */
function renderCategoryFreqChart() {
  destroyChart('chart-cat-freq');
  const ctx = document.getElementById('chart-cat-freq');
  if (!ctx) return;

  // Sort by count desc
  const sorted = [...Analytics.categoryStats].sort((a, b) => b.count - a.count);
  const labels = sorted.map(s => s.category);
  const data   = sorted.map(s => s.count);
  const colors = labels.map(c => `${getCatColor(c)}cc`);

  Charts['chart-cat-freq'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Transactions',
        data,
        backgroundColor: colors,
        borderColor:     colors.map(c => c.replace('cc', 'ff')),
        borderWidth:     1,
        borderRadius:    4,
        borderSkipped:   false,
      }],
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: {
          grid:        { color: '#21262d' },
          ticks:       { color: '#7d8590', stepSize: 5 },
          beginAtZero: true,
        },
        y: {
          grid:  { display: false },
          ticks: { color: '#c9d1d9', font: { size: 10 } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} transactions`,
          },
        },
      },
    },
  });
}

// ─── 4. Average expense by category ──────────────────────────────────────────

/**
 * Vertical bar: average transaction amount per category.
 * Error bars drawn as custom annotation lines (IQR whiskers).
 */
function renderAvgCatChart() {
  destroyChart('chart-avg-cat');
  const ctx = document.getElementById('chart-avg-cat');
  if (!ctx) return;

  const stats  = [...Analytics.categoryStats].sort((a, b) => b.avg - a.avg);
  const labels = stats.map(s => s.category);
  const avgs   = stats.map(s => s.avg);
  const colors = labels.map(c => `${getCatColor(c)}bb`);

  Charts['chart-avg-cat'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Avg Expense',
        data:            avgs,
        backgroundColor: colors,
        borderColor:     colors.map(c => c.replace('bb', 'ff')),
        borderWidth:     1,
        borderRadius:    4,
        borderSkipped:   false,
      }],
    },
    options: {
      scales: {
        x: {
          grid:  { display: false },
          ticks: { color: '#7d8590', maxRotation: 30, font: { size: 9.5 } },
        },
        y: {
          grid:  { color: '#21262d' },
          ticks: {
            color: '#7d8590',
            callback: v => formatCurrency(v, true),
          },
          beginAtZero: true,
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => {
              const s = stats[ctx.dataIndex];
              return [
                ` Avg: ${formatCurrency(s.avg)}`,
                ` Min: ${formatCurrency(s.min)}`,
                ` Max: ${formatCurrency(s.max)}`,
                ` Count: ${s.count}`,
              ];
            },
          },
        },
      },
    },
  });
}

// ─── 5. Transaction timeline scatter ─────────────────────────────────────────

/**
 * Scatter plot: each transaction as a dot (x=date, y=amount).
 * Normal transactions: teal; anomalies: amber with larger radius.
 * IQR upper fence drawn as a horizontal annotation line.
 */
function renderScatterChart() {
  destroyChart('chart-scatter');
  const ctx = document.getElementById('chart-scatter');
  if (!ctx) return;

  const transactions = AppData.transactions;

  // Convert date to numeric timestamp for Chart.js
  const normal   = transactions.filter(t => !t.isAnomaly).map(t => ({
    x: t.date.getTime(),
    y: t.amount,
    t,  // carry reference for tooltip
  }));
  const anomalies = transactions.filter(t => t.isAnomaly).map(t => ({
    x: t.date.getTime(),
    y: t.amount,
    t,
  }));

  // Format x-axis dates
  const dateFmt = ts => {
    const d = new Date(ts);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  };

  Charts['chart-scatter'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label:           'Normal',
          data:            normal,
          backgroundColor: `${PALETTE.teal}88`,
          borderColor:     `${PALETTE.teal}cc`,
          borderWidth:     1,
          pointRadius:     4,
          pointHoverRadius:6,
        },
        {
          label:           'Anomaly',
          data:            anomalies,
          backgroundColor: `${PALETTE.amber}99`,
          borderColor:     PALETTE.amber,
          borderWidth:     1.5,
          pointRadius:     7,
          pointHoverRadius:9,
          pointStyle:      'triangle',
        },
      ],
    },
    options: {
      scales: {
        x: {
          type:  'linear',
          grid:  { color: '#21262d' },
          ticks: {
            color:    '#7d8590',
            maxTicksLimit: 8,
            callback: v => dateFmt(v),
          },
          title: { display: false },
        },
        y: {
          grid:  { color: '#21262d' },
          ticks: {
            color:    '#7d8590',
            callback: v => formatCurrency(v, true),
          },
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          display:  true,
          position: 'top',
          align:    'end',
          labels: {
            padding:    12,
            boxWidth:   10,
            boxHeight:  10,
            color:      '#c9d1d9',
            font:       { size: 10 },
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            title: ctx => {
              const pt = ctx[0].raw;
              return pt.t.dateStr;
            },
            label: ctx => {
              const pt = ctx.raw;
              return [
                ` ${pt.t.description.substring(0, 48)}…`,
                ` ${formatCurrency(pt.t.amount)}  · ${pt.t.category}`,
                pt.t.isAnomaly ? ' ⚠ Anomaly detected' : '',
              ].filter(Boolean);
            },
          },
        },
        annotation: {
          annotations: {
            fence: {
              type:        'line',
              yMin:        Analytics.iqrUpperFence,
              yMax:        Analytics.iqrUpperFence,
              borderColor: `${PALETTE.amber}66`,
              borderWidth: 1,
              borderDash:  [6, 4],
              label: {
                display:    true,
                content:    `IQR fence  ${formatCurrency(Analytics.iqrUpperFence, true)}`,
                position:   'end',
                color:      `${PALETTE.amber}bb`,
                font:       { size: 9, weight: '500' },
                backgroundColor: 'transparent',
                yAdjust:    -8,
              },
            },
          },
        },
      },
    },
  });
}

// ─── Render all charts ────────────────────────────────────────────────────────

/**
 * Render all five charts.
 * Call after AppData and Analytics are populated.
 */
function renderAllCharts() {
  applyChartDefaults();
  renderMonthlyChart();
  renderCategoryDonut();
  renderCategoryFreqChart();
  renderAvgCatChart();
  renderScatterChart();
}

/**
 * Destroy all rendered charts (cleanup on data reload).
 */
function destroyAllCharts() {
  Object.keys(Charts).forEach(id => {
    if (Charts[id]) { Charts[id].destroy(); delete Charts[id]; }
  });
}
