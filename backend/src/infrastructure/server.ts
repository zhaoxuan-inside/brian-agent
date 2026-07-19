import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { runWithTraceId } from './logger.js';
import { v4 as uuidv4 } from 'uuid';
import { cache } from './cache.js';

const connectedClients = new Set<WebSocket>();

export function createServer(): Express {
  const app = express();
  const config = getConfig();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id'],
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const traceId = (req.headers['x-trace-id'] as string) || uuidv4();
    runWithTraceId(traceId, () => {
      const start = Date.now();
      const originalUrl = req.originalUrl;
      logger.request('HTTP', req.method, originalUrl, req.body && Object.keys(req.body).length > 0 ? { size: JSON.stringify(req.body).length } : undefined);

      const originalEnd = _res.end.bind(_res);
      _res.end = function (...args: unknown[]) {
        const duration = Date.now() - start;
        logger.response('HTTP', req.method, originalUrl, _res.statusCode, duration);
        return originalEnd(...args as Parameters<typeof _res.end>);
      };

      next();
    });
  });

  return app;
}

export function setupSSE(req: Request, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

export function sendSSEEvent(res: Response, event: string, data: unknown): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\ndata: ${payload}\n\n`);
}

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export function setupWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientId = uuidv4();
    connectedClients.add(ws);
    logger.info('WebSocket', `Client connected: ${clientId} from ${req.socket.remoteAddress}`);

    ws.send(JSON.stringify({
      type: 'connected',
      payload: { clientId },
      timestamp: Date.now(),
    }));

    ws.on('message', (raw: Buffer) => {
      try {
        const msg: WebSocketMessage = JSON.parse(raw.toString());
        logger.info('WebSocket', `Message from ${clientId}: ${msg.type}`, msg.payload);
      } catch {
        logger.warn('WebSocket', `Invalid message from ${clientId}`);
      }
    });

    ws.on('close', () => {
      connectedClients.delete(ws);
      logger.info('WebSocket', `Client disconnected: ${clientId}`);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket', `Error from ${clientId}: ${err.message}`);
      connectedClients.delete(ws);
    });
  });

  wss.on('error', (err) => {
    logger.error('WebSocket', `Server error: ${err.message}`);
  });

  return wss;
}

export function broadcastWebSocket(wss: WebSocketServer, message: WebSocketMessage): void {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

export function startHttpServer(app: Express, port?: number): http.Server {
  const config = getConfig();
  const listenPort = port ?? config.port;

  const server = http.createServer(app);
  
  server.timeout = 5 * 60 * 1000;
  server.keepAliveTimeout = 5 * 60 * 1000;
  server.headersTimeout = 5 * 60 * 1000 + 1000;

  setupWebSocket(server);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('Server', `Port ${listenPort} is already in use`);
    } else {
      logger.error('Server', `Server error: ${err.message}`);
    }
  });

  return server;
}

export function gracefulShutdown(server: http.Server, signal: string): void {
  logger.info('Server', `Received ${signal}, shutting down gracefully...`);
  cache.stop();

  server.close(() => {
    logger.info('Server', 'HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Server', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}