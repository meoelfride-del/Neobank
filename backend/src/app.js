require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
require('dotenv').config();
const db = require('./config/database');
const { getClientOrigins } = require('./config/clientOrigins');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const cardRoutes = require('./routes/cardRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  const supplied = req.get('X-Request-ID');
  req.id = supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Render termine HTTPS devant l'application et transmet l'IP du client dans
// X-Forwarded-For. Une seule couche de proxy est attendue en production.
if (process.env.RENDER || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// --- Sécurité de base -------------------------------------------------
app.use(helmet());
app.use(cors({ origin: getClientOrigins(), credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Limitation de débit globale, plus stricte sur l'authentification
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Trop de tentatives, réessayez plus tard.' } });
const monitoringLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Trop de rapports.' } });
app.use(globalLimiter);

// --- Routes --------------------------------------------------------------
app.get('/', (req, res) => res.json({
  service: 'NeoBank API',
  status: 'online',
  database: 'PostgreSQL',
  health: '/api/health',
  version: process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION || 'local',
}));

app.get('/api', (req, res) => res.json({
  service: 'NeoBank API',
  status: 'online',
  health: '/api/health',
}));

app.get('/api/health', async (req, res) => {
  await db.pool.query('SELECT 1');
  res.json({
    status: 'ok',
    database: 'postgresql',
    timestamp: new Date().toISOString(),
    version: process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION || 'local',
  });
});

app.get('/api/ready', async (req, res) => {
  await db.pool.query('SELECT 1');
  res.json({ status: 'ready', uptimeSeconds: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

app.post('/api/monitoring/client-error', monitoringLimiter, (req, res) => {
  const clean = (value, limit) => String(value || '').replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, limit);
  const report = {
    name: clean(req.body?.name || 'Error', 80),
    message: clean(req.body?.message || 'Erreur inconnue', 500),
    componentStack: clean(req.body?.componentStack, 2000),
    path: clean(req.body?.path, 300),
    timestamp: new Date().toISOString(),
  };
  console.error('[client-error]', JSON.stringify(report));
  res.status(202).json({ accepted: true });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

