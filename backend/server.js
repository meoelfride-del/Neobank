require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const db = require('./src/config/database');
const initSockets = require('./src/sockets');
const { startCronJobs } = require('./src/services/cronService');

async function startServer() {
  await db.initDatabase();

  const port = Number.parseInt(process.env.PORT || '4000', 10);
  const socketPort = Number.parseInt(process.env.SOCKET_PORT || `${port}`, 10) || port;
  const apiServer = http.createServer(app);
  const socketServer = socketPort === port ? apiServer : http.createServer();
  const io = new Server(socketServer, {
    cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
  });

  initSockets(io);
  app.set('io', io);
  const cronTask = startCronJobs(io);

  await new Promise((resolve, reject) => {
    apiServer.once('error', reject);
    apiServer.listen(port, resolve);
  });
  console.log(`NeoBank API démarrée sur http://localhost:${port}`);

  if (socketServer !== apiServer) {
    await new Promise((resolve, reject) => {
      socketServer.once('error', reject);
      socketServer.listen(socketPort, resolve);
    });
  }
  console.log(`WebSocket temps réel actif sur http://localhost:${socketPort}`);

  return {
    async close() {
      cronTask.stop();
      await new Promise((resolve) => io.close(resolve));
      if (socketServer !== apiServer) {
        await new Promise((resolve) => apiServer.close(resolve));
      }
      await db.close();
    },
  };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[startup]', error);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
