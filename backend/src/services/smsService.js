const { randomUUID } = require('node:crypto');
const db = require('../config/database');

function provider() { return process.env.SMS_PROVIDER || 'twilio'; }
async function diagnose(fetcher = fetch) {
  if (provider() !== 'textbee') return { state: 'not_textbee', message: 'Sélectionnez TextBee pour utiliser ce contrôle.' };
  const missing = [];
  if (!process.env.TEXTBEE_API_KEY?.trim()) missing.push('TEXTBEE_API_KEY');
  if (!/^[a-f0-9]{24}$/i.test(process.env.TEXTBEE_DEVICE_ID || '')) missing.push('TEXTBEE_DEVICE_ID');
  if (missing.length) return { state: 'configuration_required', missing, message: 'Renseignez les accès TextBee dans backend/.env, puis redémarrez l’API.' };
  try {
    const response = await fetcher('https://api.textbee.dev/api/v1/gateway/devices/' + encodeURIComponent(process.env.TEXTBEE_DEVICE_ID), {
      method: 'GET', headers: { 'x-api-key': process.env.TEXTBEE_API_KEY }, signal: AbortSignal.timeout(10000),
    });
    if ([401, 403].includes(response.status)) return { state: 'authentication_failed', message: 'Accès refusé par TextBee : vérifiez la clé API et ses permissions.' };
    if ([400, 404].includes(response.status)) return { state: 'device_unavailable', message: 'Téléphone introuvable ou identifiant invalide. Vérifiez son association au compte TextBee.' };
    if (!response.ok) return { state: 'provider_unavailable', message: 'TextBee est temporairement indisponible ou limite les requêtes. Réessayez plus tard.' };
    const result = await response.json();
    if (!result.data || typeof result.data !== 'object') throw new Error('Unexpected response');
    return { state: 'connected', sendingEnabled: configured(), message: 'Connexion à TextBee vérifiée. Contrôlez aussi le réseau, les permissions et l’alimentation du téléphone avant de tester un SMS.' };
  } catch {
    return { state: 'provider_unavailable', message: 'Impossible de vérifier TextBee. Vérifiez la connexion du serveur puis réessayez.' };
  }
}
function configured(selected = provider()) {
  if (selected === 'textbee') return process.env.SMS_ENABLED === 'true'
    && !!process.env.TEXTBEE_API_KEY && /^[a-f0-9]{24}$/i.test(process.env.TEXTBEE_DEVICE_ID || '');
  if (selected !== 'twilio') return false;
  return process.env.SMS_ENABLED === 'true' && /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || '')
    && !!process.env.TWILIO_AUTH_TOKEN && !!(process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM);
}

async function requestTextbee(device, batch, job, fetcher) {
  const endpoint = batch ? `devices/${encodeURIComponent(device)}/sms-batch/${encodeURIComponent(batch)}` : 'send-sms';
  return fetcher('https://api.textbee.dev/api/v1/gateway/' + endpoint, {
    method: job ? 'POST' : 'GET',
    headers: { 'x-api-key': process.env.TEXTBEE_API_KEY, ...(job ? { 'Content-Type': 'application/json' } : {}) },
    ...(job ? { body: JSON.stringify({ deviceId: device, recipients: [job.recipient], message: job.message }) } : {}),
    signal: AbortSignal.timeout(10000),
  });
}

async function enqueue(userId, eventKey, message) {
  const user = await db.prepare('SELECT phone FROM users WHERE id=?').get(userId);
  if (!user) return;
  const phone = (user.phone || '').replace(/[\s().-]/g, '');
  const status = /^\+[1-9]\d{7,14}$/.test(phone) ? 'pending' : 'invalid_phone';
  await db.prepare(`INSERT INTO sms_outbox(id,user_id,event_key,recipient,message,status)
    VALUES(?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING`)
    .run(randomUUID(), userId, eventKey, phone, message, status);
}

async function requestTwilio(sid, payload, fetcher) {
  const account = process.env.TWILIO_ACCOUNT_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages${sid ? '/' + sid : ''}.json`;
  return fetcher(url, {
    method: payload ? 'POST' : 'GET',
    headers: {
      Authorization: 'Basic ' + Buffer.from(account + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64'),
      ...(payload ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(payload ? { body: payload.toString() } : {}),
    signal: AbortSignal.timeout(10000),
  });
}

let busy = false;
async function dispatch(fetcher = fetch) {
  if (!configured() || busy) return;
  busy = true;
  try {
    // A claim left behind after a crash must not be automatically sent twice.
    const stale = new Date(Date.now() - 120000).toISOString();
    await db.prepare("UPDATE sms_outbox SET status='uncertain' WHERE status='processing' AND updated_at < ?").run(stale);
    const rows = await db.prepare("SELECT id FROM sms_outbox WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT 10").all(new Date().toISOString());
    for (const row of rows) {
      const job = await db.transaction(async () => {
        const current = await db.prepare('SELECT * FROM sms_outbox WHERE id=? FOR UPDATE').get(row.id);
        if (current.status !== 'pending') return null;
        const selected = provider();
        const device = selected === 'textbee' ? process.env.TEXTBEE_DEVICE_ID : null;
        await db.prepare("UPDATE sms_outbox SET status='processing', provider=?, provider_device_id=?, attempts=attempts+1, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(selected, device, row.id);
        return { ...current, provider: selected, provider_device_id: device };
      })();
      if (!job) continue;
      const payload = new URLSearchParams({ To: job.recipient, Body: job.message });
      if (process.env.TWILIO_MESSAGING_SERVICE_SID) payload.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
      else payload.set('From', process.env.TWILIO_FROM);
      try {
        const response = job.provider === 'textbee'
          ? await requestTextbee(job.provider_device_id, null, job, fetcher)
          : await requestTwilio(null, payload, fetcher);
        if (response.status === 429) {
          if (job.provider === 'textbee') {
            const delay = Number(response.headers?.get('retry-after'));
            const seconds = Number.isFinite(delay) && delay > 0 ? Math.min(Math.max(delay, 60), 86400) : 3600;
            await db.prepare("UPDATE sms_outbox SET status='pending', error_code='QUOTA_LIMIT', next_attempt_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
              .run(new Date(Date.now() + seconds * 1000).toISOString(), job.id);
            continue;
          }
          await db.prepare('UPDATE sms_outbox SET status=?, error_code=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .run(job.attempts < 2 ? 'pending' : 'failed', 'RATE_LIMIT', job.id);
          continue;
        }
        if (!response.ok) {
          await db.prepare('UPDATE sms_outbox SET status=?, error_code=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .run(response.status >= 500 ? 'uncertain' : 'failed', 'HTTP_' + response.status, job.id);
          continue;
        }
        const result = await response.json();
        const identifier = job.provider === 'textbee' ? result.data?.smsBatchId : result.sid;
        if (job.provider === 'textbee'
          ? result.data?.success !== true || !/^[a-f0-9]{24}$/i.test(identifier || '')
          : !/^SM[a-f0-9]{32}$/i.test(identifier || '')) throw new Error('Unexpected acknowledgement');
        await db.prepare("UPDATE sms_outbox SET status='accepted', provider_sid=?, error_code=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(identifier, job.id);
      } catch {
        await db.prepare("UPDATE sms_outbox SET status='uncertain', error_code='ACK_UNKNOWN', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(job.id);
      }
    }
    const accepted = await db.prepare("SELECT id,recipient,provider,provider_device_id,provider_sid FROM sms_outbox WHERE status='accepted' ORDER BY updated_at LIMIT 10").all();
    for (const row of accepted) {
      try {
        if (!configured(row.provider)) continue;
        const response = row.provider === 'textbee'
          ? await requestTextbee(row.provider_device_id, row.provider_sid, null, fetcher)
          : await requestTwilio(row.provider_sid, null, fetcher);
        if (!response.ok) continue;
        const result = await response.json();
        const state = row.provider === 'textbee'
          ? result.data?.messages?.find(message => message.recipient === row.recipient)?.status
          : result.status;
        const status = state === 'delivered' ? 'delivered' : ['failed', 'undelivered', 'canceled'].includes(state) ? 'failed' : 'accepted';
        await db.prepare('UPDATE sms_outbox SET status=?, error_code=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .run(status, result.error_code ? String(result.error_code) : null, row.id);
      } catch { /* Next poll checks delivery without resending the message. */ }
    }
  } finally { busy = false; }
}

function start() {
  const tick = () => dispatch().catch(() => console.error('[sms] Traitement différé indisponible.'));
  const interval = setInterval(tick, 30000);
  interval.unref();
  tick();
  return () => clearInterval(interval);
}

module.exports = { enqueue, dispatch, configured, provider, diagnose, start };
