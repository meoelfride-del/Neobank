const { v4: uuid } = require('uuid');
const db = require('../config/database');
const { getBotReply } = require('../services/chatbotService');

async function history(req, res) {
  const messages = await db.prepare(`
    SELECT * FROM chat_messages WHERE user_id = ? ORDER BY timestamp ASC LIMIT 100
  `).all(req.user.id);
  res.json({ messages });
}

async function sendMessage(req, res) {
  const { content } = req.body;
  const userMsgId = uuid();

  await db.prepare(`
    INSERT INTO chat_messages (id, user_id, sender, content) VALUES (?, ?, 'user', ?)
  `).run(userMsgId, req.user.id, content);

  const { reply, escalated } = getBotReply(content);
  const botMsgId = uuid();

  await db.prepare(`
    INSERT INTO chat_messages (id, user_id, sender, content, escalated) VALUES (?, ?, 'bot', ?, ?)
  `).run(botMsgId, req.user.id, reply, escalated);

  const io = req.app.get('io');
  if (io) io.to(`user:${req.user.id}`).emit('chat:message', { sender: 'bot', content: reply, escalated });

  res.status(201).json({ reply, escalated });
}

module.exports = { history, sendMessage };
