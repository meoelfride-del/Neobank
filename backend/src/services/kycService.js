const db = require('../config/database');

/**
 * Simule la validation KYC/AML normalement déléguée à un SDK tiers
 * (Sumsub, Onfido...). Ici, on valide automatiquement après un court délai
 * pour simuler le traitement asynchrone d'un vrai fournisseur.
 */
function submitKyc(userId) {
  db.prepare(`UPDATE users SET status_kyc = 'in_review' WHERE id = ?`).run(userId);

  // Simulation d'un traitement asynchrone (webhook fournisseur en réalité)
  setTimeout(() => {
    // 90% de réussite automatique pour la démo
    const approved = Math.random() > 0.1;
    db.prepare(`UPDATE users SET status_kyc = ? WHERE id = ?`).run(
      approved ? 'verified' : 'rejected',
      userId
    );
  }, 4000);

  return { status: 'in_review' };
}

module.exports = { submitKyc };
