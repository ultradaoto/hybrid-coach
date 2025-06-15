import cron from 'node-cron';
import SkoolMonitoringService from '../services/skoolMonitoringService.js';
import winston from 'winston';

// Configure logger for daemon
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [SKOOL-DAEMON] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/skool-daemon.log' })
  ],
});

class SkoolSyncDaemon {
  constructor() {
    this.monitoringService = new SkoolMonitoringService();
    this.isRunning = false;
    this.cronJob = null;
  }

  start() {
    if (process.env.MONITORING_ENABLED !== 'true') {
      logger.warn('Skool monitoring is disabled. Set MONITORING_ENABLED=true to enable.');
      return;
    }

    logger.info('Starting Skool sync daemon...');

    // Schedule daily sync at midnight (00:00)
    this.cronJob = cron.schedule('0 0 * * *', async () => {
      await this.performSync();
    }, {
      scheduled: true,
      timezone: "America/New_York" // Adjust timezone as needed
    });

    // Also schedule a sync 30 minutes after startup for testing
    if (process.env.NODE_ENV === 'development') {
      logger.info('Development mode: scheduling sync in 5 minutes...');
      setTimeout(async () => {
        await this.performSync();
      }, 5 * 60 * 1000); // 5 minutes
    }

    logger.info('Skool sync daemon started successfully. Next sync at midnight.');
  }

  async performSync() {
    if (this.isRunning) {
      logger.warn('Sync already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      logger.info('Starting scheduled Skool membership sync...');

      const result = await this.monitoringService.performDailySync();

      if (result.success) {
        logger.info(`Sync completed successfully in ${result.duration}ms`);
        logger.info(`Ultra: ${result.ultra.membersFound} members, ${result.ultra.changes?.newMembers || 0} new, ${result.ultra.changes?.statusChanges || 0} changes`);
        logger.info(`Vagus: ${result.vagus.membersFound} members, ${result.vagus.changes?.newMembers || 0} new, ${result.vagus.changes?.statusChanges || 0} changes`);

        // Send success notification if configured
        await this.sendNotification('success', result);
      } else {
        logger.error(`Sync failed: ${result.error}`);
        
        // Send failure notification
        await this.sendNotification('failure', result);
      }

    } catch (error) {
      logger.error(`Unexpected error during sync: ${error.message}`);
      logger.error(error.stack);

      // Send critical error notification
      await this.sendNotification('critical', { error: error.message });
    } finally {
      this.isRunning = false;
      const endTime = new Date();
      const duration = endTime - startTime;
      logger.info(`Sync operation completed. Total duration: ${duration}ms`);
    }
  }

  async sendNotification(type, data) {
    try {
      // This can be extended to send email, Slack, or other notifications
      const notificationData = {
        type,
        timestamp: new Date().toISOString(),
        data
      };

      if (type === 'success') {
        logger.info('✅ Sync completed successfully');
      } else if (type === 'failure') {
        logger.error('❌ Sync failed');
      } else if (type === 'critical') {
        logger.error('🚨 Critical error during sync');
      }

      // TODO: Implement actual notification sending (email, webhook, etc.)
      // For now, just log the notification
      logger.info(`Notification sent: ${JSON.stringify(notificationData)}`);

    } catch (error) {
      logger.error(`Failed to send notification: ${error.message}`);
    }
  }

  // Manual sync trigger for testing
  async triggerManualSync() {
    logger.info('Manual sync triggered...');
    await this.performSync();
  }

  // Get sync status
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.cronJob ? this.cronJob.running : false,
      nextRun: this.cronJob ? this.cronJob.nextDate() : null,
      monitoringEnabled: process.env.MONITORING_ENABLED === 'true'
    };
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Skool sync daemon stopped');
    }
  }
}

// Create singleton instance
const skoolSyncDaemon = new SkoolSyncDaemon();

// Auto-start if running as main module
if (process.env.NODE_ENV !== 'test') {
  skoolSyncDaemon.start();
}

export default skoolSyncDaemon;