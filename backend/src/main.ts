import { createApp } from './app';
import { initDatabase } from './infrastructure/database';
import { getConfig } from './infrastructure/config';
import { logger } from './infrastructure/logger';
import { gracefulShutdown } from './infrastructure/server';
import { cache } from './infrastructure/cache';
import http from 'http';

async function main(): Promise<void> {
  try {
    // Initialize database
    logger.info('SYSTEM', 'Initializing database...');
    initDatabase();
    logger.info('SYSTEM', 'Database initialized');

    // Start cache cleanup
    cache.start();

    // Create application
    const app = createApp();

    // Get configuration
    const config = getConfig();

    // Create HTTP server
    const server = http.createServer(app);

    // Start server
    server.listen(config.port, config.host, () => {
      logger.info('SYSTEM', `Brian-Agent server started on http://${config.host}:${config.port}`);

      // Log available endpoints
      logger.info('SYSTEM', 'API endpoints:');
      logger.info('SYSTEM', '  /api/health       - Health check');
      logger.info('SYSTEM', '  /api/chat         - Chat completion');
      logger.info('SYSTEM', '  /api/chat/stream  - Streaming chat');
      logger.info('SYSTEM', '  /api/chat/chain/:id - Agent chain');
      logger.info('SYSTEM', '  /api/config       - Configuration');
      logger.info('SYSTEM', '  /api/memory       - Memory management');
      logger.info('SYSTEM', '  /api/mcp          - MCP management');
      logger.info('SYSTEM', '  /api/skill        - Skill management');
      logger.info('SYSTEM', '  /api/agent        - Agent management');
      logger.info('SYSTEM', '  /api/feedback     - Feedback management');
      logger.info('SYSTEM', '  /api/system       - System statistics');
      logger.info('SYSTEM', '  /api/analytics    - Analytics data');
      logger.info('SYSTEM', '  /api/library      - Library management');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      logger.error('SYSTEM', `Uncaught exception: ${err.message}`, { stack: err.stack });
      gracefulShutdown(server, 'uncaughtException');
    });

    process.on('unhandledRejection', (reason: any) => {
      logger.error('SYSTEM', `Unhandled rejection: ${reason?.message || reason}`, {
        stack: reason?.stack,
      });
    });
  } catch (err: any) {
    console.error('Failed to start server:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});