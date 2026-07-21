require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const db = require('./config/database');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const cardRoutes = require('./routes/cardRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// --- Sécurité de base -------------------------------------------------
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Limitation de débit globale, plus stricte sur l'authentification
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Trop de tentatives, réessayez plus tard.' } });
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

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
