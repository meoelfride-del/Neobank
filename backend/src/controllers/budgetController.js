const db = require('../config/database');
const { buildBudgetSummary } = require('../services/budgetService');

function getBudgetSummary(req, res) {
  const { accountId } = req.params;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account || account.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  }

  const transactions = db.prepare(`
    SELECT * FROM transactions
    WHERE source_account_id = ? AND timestamp > datetime('now', '-30 days')
  `).all(accountId);

  // Seuils d'alerte par défaut (paramétrables ultérieurement en base)
  const thresholds = {
    Alimentation: 400,
    Logement: 900,
    Loisirs: 150,
    Transport: 120,
    Santé: 200,
    Shopping: 200,
  };

  const summary = buildBudgetSummary(transactions, thresholds);
  const totalSpent = summary.reduce((sum, s) => sum + s.total, 0);

  res.json({ summary, totalSpent: Math.round(totalSpent * 100) / 100 });
}

module.exports = { getBudgetSummary };
