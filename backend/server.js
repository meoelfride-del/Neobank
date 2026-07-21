require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const initSockets = require('./src/sockets');
const { startCronJobs } = require('./src/services/cronService');

const PORT = Number.parseInt(process.env.PORT || '4000', 10);
const SOCKET_PORT = Number.parseInt(process.env.SOCKET_PORT || `${PORT}`, 10) || PORT;

const apiServer = http.createServer(app);
const socketServer = SOCKET_PORT === PORT ? apiServer : http.createServer();

const io = new Server(socketServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
});

initSockets(io);
app.set('io', io); // accessible depuis les contrôleurs via req.app.get('io')

startCronJobs(io);

apiServer.listen(PORT, () => {
  console.log(`NeoBank API démarrée sur http://localhost:${PORT}`);
});

if (socketServer !== apiServer) {
  socketServer.listen(SOCKET_PORT, () => {
    console.log(`WebSocket temps réel actif sur http://localhost:${SOCKET_PORT}`);
  });
} else {
  console.log(`WebSocket temps réel actif sur http://localhost:${PORT}`);
}
