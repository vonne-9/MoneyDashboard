// charts.js — the net-worth-over-time trend chart (Chart.js, vendored globally as `Chart`).

let chart = null;

// Draw or update the trend line from an array of { date, totalInBase } snapshots.
export function renderTrend(canvas, snapshots, baseCurrency) {
  if (!canvas || typeof Chart === 'undefined') return;

  const points = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const labels = points.map((s) => s.date);
  const values = points.map((s) => Math.round(s.totalInBase));

  const data = {
    labels,
    datasets: [
      {
        label: `Net worth (${baseCurrency})`,
        data: values,
        borderColor: '#111',
        borderWidth: 3,
        backgroundColor: 'rgba(126, 231, 199, 0.35)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#ff9ec7',
        pointBorderColor: '#111',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#111', font: { family: 'Nunito', weight: '700' } } },
      y: {
        grid: { color: 'rgba(17,17,17,0.08)' },
        ticks: {
          color: '#111',
          font: { family: 'Nunito', weight: '700' },
          callback: (v) => v.toLocaleString(),
        },
      },
    },
  };

  if (chart) {
    chart.data = data;
    chart.options = options;
    chart.update();
  } else {
    chart = new Chart(canvas.getContext('2d'), { type: 'line', data, options });
  }
}

let barChart = null;

// Monthly expense bars. The selected month is filled in; the rest sit back so
// the comparison reads at a glance. Clicking a bar calls onSelect(monthKey).
export function renderMonthlyBars(canvas, rows, baseCurrency, selectedKey, onSelect) {
  if (!canvas || typeof Chart === 'undefined') return;

  const isSel = (r) => r.key === selectedKey;
  const data = {
    labels: rows.map((r) => r.label),
    datasets: [
      {
        label: `Spent (${baseCurrency})`,
        data: rows.map((r) => Math.round(r.total * 100) / 100),
        backgroundColor: rows.map((r) => (isSel(r) ? '#ff9ec7' : 'rgba(160, 196, 255, 0.55)')),
        borderColor: '#111',
        borderWidth: rows.map((r) => (isSel(r) ? 3 : 2)),
        borderRadius: 6,
        hoverBackgroundColor: rows.map((r) => (isSel(r) ? '#ff9ec7' : 'rgba(160, 196, 255, 0.85)')),
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_evt, elements) => {
      if (elements.length && typeof onSelect === 'function') onSelect(rows[elements[0].index].key);
    },
    onHover: (evt, elements) => {
      if (evt?.native?.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${baseCurrency} ${Number(ctx.raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#111', font: { family: 'Nunito', weight: '700' } } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(17,17,17,0.08)' },
        ticks: { color: '#111', font: { family: 'Nunito', weight: '700' }, callback: (v) => v.toLocaleString() },
      },
    },
  };

  if (barChart) {
    barChart.data = data;
    barChart.options = options;
    barChart.update();
  } else {
    barChart = new Chart(canvas.getContext('2d'), { type: 'bar', data, options });
  }
}
