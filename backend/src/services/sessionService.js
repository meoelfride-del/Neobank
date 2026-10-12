const jwt = require('jsonwebtoken');
const db = require('../config/database');
const crypto = require('node:crypto');
async function verifyAccess(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.type !== 'access' || !payload.sid || !Number.isFinite(payload.exp)) throw new Error('Session requise');
  const session = await db.prepare('SELECT * FROM refresh_sessions WHERE id=?').get(payload.sid);
  if (!session || session.user_id !== payload.sub || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) throw new Error('Session révoquée');
  return payload;
}
async function revoke(userId, sessionId) {
  return db.transaction(async () => {
    const ids = [];
    let current = sessionId;
    while (current && !ids.includes(current)) {
      const row = await db.prepare('SELECT * FROM refresh_sessions WHERE id=? FOR UPDATE').get(current);
      if (!row || row.user_id !== userId) break;
      await db.prepare('UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE id=?').run(current);
      ids.push(current); current = row.replaced_by;
    }
    if (ids.length) await db.prepare('INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)').run(crypto.randomUUID(), userId, 'session_revoke', JSON.stringify({ sessionIds: ids }));
    return ids;
  })();
}
module.exports = { verifyAccess, revoke };
