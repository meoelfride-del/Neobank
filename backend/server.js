require('dotenv').config();
require('./src/config/runtimeValidation').validateRuntime();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const db = require('./src/config/database');
const { getClientOrigins } = require('./src/config/clientOrigins');
const { bootstrapAdmin } = require('./src/config/bootstrapAdmin');
const initSockets = require('./src/sockets');
const { startCronJobs } = require('./src/services/cronService');

async function startServer() {
  await db.initDatabase();
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await bootstrapAdmin();
  }

  const port = Number.parseInt(process.env.PORT || '4000', 10);
  const socketPort = Number.parseInt(process.env.SOCKET_PORT || `${port}`, 10) || port;
  const apiServer = http.createServer(app);
  const socketServer = socketPort === port ? apiServer : http.createServer();
  const io = new Server(socketServer, {
    cors: { origin: getClientOrigins(), credentials: true },
  });

  initSockets(io);
  app.set('io', io);
  const cronTask = startCronJobs(io);
  const stopSms = require('./src/services/smsService').start();

  await new Promise((resolve, reject) => {
    apiServer.once('error', reject);
    apiServer.listen(port, resolve);
  });
  console.log(`NEO BANK API démarrée sur http://localhost:${port}`);

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
      stopSms();
      await new Promise((resolve) => io.close(resolve));
      if (socketServer !== apiServer) {
        await new Promise((resolve) => apiServer.close(resolve));
      }
      await db.close();
    },
  };
}

if (require.main === module) {
  let runningServer;
  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[shutdown] signal ${signal}, arrêt gracieux en cours`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    try {
      if (runningServer) await runningServer.close();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      console.error('[shutdown]', error);
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  startServer()
    .then((instance) => { runningServer = instance; })
    .catch((error) => {
      console.error('[startup]', error);
      process.exitCode = 1;
    });
}

module.exports = { startServer };

