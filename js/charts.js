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
