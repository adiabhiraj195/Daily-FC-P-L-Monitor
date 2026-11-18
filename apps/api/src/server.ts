import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();
const PORT = config.API_PORT;

const server = app.listen(PORT, () => {
  console.log(`[Express API] Prozo FC Margin Monitor API running on http://localhost:${PORT}`);
  console.log(`[Express API] Health ready at http://localhost:${PORT}/health/ready`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`[Express API] Received ${signal}. Shutting down HTTP server...`);
  server.close(() => {
    console.log('[Express API] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
