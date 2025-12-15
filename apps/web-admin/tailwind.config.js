/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Include Tremor components
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom admin theme colors
        admin: {
          bg: '#0f1419',
          card: '#1a1f2e',
          border: '#2d3748',
          accent: '#6366f1',
        },
        // Speaker colors for transcripts
        speaker: {
          client: '#10b981',    // Emerald for client
          coach: '#3b82f6',     // Blue for coach
          ai: '#a855f7',        // Purple for AI
        },
        // Log level colors
        log: {
          error: '#ef4444',
          warn: '#f59e0b',
          info: '#3b82f6',
          debug: '#6b7280',
        },
      },
    },
  },
  plugins: [],
};
