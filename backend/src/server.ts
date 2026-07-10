import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { config } from './config';

export async function startServer(app: express.Application, port: number): Promise<void> {
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    socket.on('message', (data: unknown) => {
      console.log('Received message:', data);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, config.host, () => {
      console.log(`Server running on http://${config.host}:${port}`);
      console.log(`WebSocket available on ws://${config.host}:${port}`);
      resolve();
    });
  });
}
