import { createApp, startServer, config } from './index';

async function main() {
  const app = createApp();
  await startServer(app, config.port);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
