const db = require('../config/database');

async function listNotifications(req, res) {
  const unreadOnly = req.query.unread === 'true';
  const notifications = await db.prepare(`
    SELECT id, title, message, kind, action_url, read_at, created_at
    FROM notifications
    WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}
    ORDER BY created_at DESC LIMIT 100
  `).all(req.user.id);
  res.json({ notifications });
}

async function markAsRead(req, res) {
  const notification = await db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?')
    .get(req.params.notificationId, req.user.id);
  if (!notification) return res.status(404).json({ error: 'Notification introuvable.' });
  await db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ?').run(notification.id);
  res.json({ message: 'Notification marquée comme lue.' });
}

async function markAllAsRead(req, res) {
  await db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'Toutes les notifications sont marquées comme lues.' });
}

module.exports = { listNotifications, markAsRead, markAllAsRead };
