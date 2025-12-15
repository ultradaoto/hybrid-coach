import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DataPoint {
  timestamp: Date;
  sessions: number;
  users: number;
}

export default function ActivityChart() {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const dataRef = useRef<DataPoint[]>([]);

  // Initialize with some data points
  useEffect(() => {
    const now = Date.now();
    dataRef.current = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(now - (20 - i) * 5000),
      sessions: Math.floor(Math.random() * 10) + 5,
      users: Math.floor(Math.random() * 50) + 20,
    }));
  }, []);

  // Simulate real-time updates (replace with WebSocket in production)
  useEffect(() => {
    const interval = setInterval(() => {
      const chart = chartRef.current;
      if (!chart) return;

      // Add new data point
      const newPoint: DataPoint = {
        timestamp: new Date(),
        sessions: Math.floor(Math.random() * 10) + 5,
        users: Math.floor(Math.random() * 50) + 20,
      };

      dataRef.current.push(newPoint);
      if (dataRef.current.length > 20) {
        dataRef.current.shift();
      }

      // Update chart
      chart.data.labels = dataRef.current.map((d) =>
        d.timestamp.toLocaleTimeString()
      );
      chart.data.datasets[0].data = dataRef.current.map((d) => d.sessions);
      chart.data.datasets[1].data = dataRef.current.map((d) => d.users);
      chart.update('none'); // Update without animation for performance
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const data = {
    labels: dataRef.current.map((d) => d.timestamp.toLocaleTimeString()),
    datasets: [
      {
        label: 'Active Sessions',
        data: dataRef.current.map((d) => d.sessions),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Active Users',
        data: dataRef.current.map((d) => d.users),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: 'rgba(45, 55, 72, 0.5)' },
        ticks: { color: '#9ca3af' },
      },
      y: {
        grid: { color: 'rgba(45, 55, 72, 0.5)' },
        ticks: { color: '#9ca3af' },
        beginAtZero: true,
      },
    },
    plugins: {
      legend: {
        labels: { color: '#9ca3af' },
      },
    },
  };

  return (
    <div className="h-64">
      <Line ref={chartRef} data={data} options={options} />
    </div>
  );
}
