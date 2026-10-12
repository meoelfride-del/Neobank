const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { verifyAccess } = require('../services/sessionService');

/**
 * Initialise Socket.io : chaque utilisateur authentifié rejoint une room
 * privée `user:{id}` afin de recevoir ses propres mises à jour de solde
 * et notifications de transaction en temps réel (milliseconde près).
 */
function initSockets(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentification requise.'));
    try {
      const payload = await verifyAccess(token);
      const user = await db.prepare('SELECT id, role, status_compte FROM users WHERE id = ?').get(payload.sub);
      if (!user || user.status_compte !== 'active') {
        return next(new Error('Compte indisponible.'));
      }
      socket.userId = payload.sub;
      socket.userRole = user.role;
      socket.sessionId = payload.sid;
      socket.tokenExpiresAt = payload.exp * 1000;
      next();
    } catch {
      next(new Error('Token invalide.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    socket.join(`role:${socket.userRole}`);
    socket.join(`session:${socket.sessionId}`);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, socket.tokenExpiresAt - Date.now()));

    socket.on('disconnect', () => {
      clearTimeout(expiry);
      // rien de spécial pour l'instant, room quittée automatiquement
    });
  });
}

module.exports = initSockets;
