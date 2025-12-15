/**
 * PM2 Ecosystem Configuration
 * 
 * Hybrid Runtime Architecture:
 * - Bun: API, Web Apps, Room Manager, Skool Sync
 * - Node.js: AI Agent (LiveKit Agents require Node.js)
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only api
 *   pm2 start ecosystem.config.js --only ai-agent
 */

module.exports = {
  apps: [
    // ═══════════════════════════════════════════════════════════════════════
    // LEGACY NODE.JS SERVICE (current production)
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: 'hybridcoach-legacy',
      script: 'src/app.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
    },

    // ═══════════════════════════════════════════════════════════════════════
    // BUN SERVICES ⚡
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: 'api',
      script: 'apps/api/src/index.ts',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'room-manager',
      script: 'services/room-manager/src/index.ts',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
    {
      name: 'skool-sync',
      script: 'services/skool-sync/src/index.ts',
      interpreter: 'bun',
      cron_restart: '0 3 * * *', // Run at 3 AM daily
      autorestart: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'web-public',
      script: 'apps/web-public/dist/index.js',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 5170,
      },
    },
    {
      name: 'web-coach',
      script: 'apps/web-coach/dist/index.js',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 5171,
      },
    },
    {
      name: 'web-client',
      script: 'apps/web-client/dist/index.js',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 5172,
      },
    },
    {
      name: 'web-admin',
      script: 'apps/web-admin/dist/index.js',
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: 3703,
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // NODE.JS SERVICE 🟢 (LiveKit Agents require Node.js)
    // ═══════════════════════════════════════════════════════════════════════
    {
      name: 'ai-agent',
      script: 'services/ai-agent/dist/index.js',
      interpreter: 'node',
      node_args: '--experimental-specifier-resolution=node',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      env: {
        NODE_ENV: 'production',
        LIVEKIT_URL: 'wss://livekit.myultra.coach',
      },
    },
  ],
};
