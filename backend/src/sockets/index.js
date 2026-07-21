const jwt = require('jsonwebtoken');
const db = require('../config/database');

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
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await db.prepare('SELECT id, status_compte FROM users WHERE id = ?').get(payload.sub);
      if (!user || user.status_compte !== 'active') {
        return next(new Error('Compte indisponible.'));
      }
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Token invalide.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on('disconnect', () => {
      // rien de spécial pour l'instant, room quittée automatiquement
    });
  });
}

module.exports = initSockets;
