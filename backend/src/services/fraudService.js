/**
 * Moteur de scoring de fraude simplifié basé sur des règles.
 * Dans une architecture réelle, ceci appellerait un modèle ML dédié.
 * Retourne un score de 0 (sûr) à 100 (très suspect).
 */
function computeFraudScore({ amount, recentTxCount, isNewDestination, accountAgeDays }) {
  let score = 0;

  if (amount > 5000) score += 35;
  else if (amount > 1500) score += 15;
  else if (amount > 500) score += 5;

  if (recentTxCount > 5) score += 20;
  if (isNewDestination) score += 15;
  if (accountAgeDays < 7) score += 25;

  return Math.min(100, score);
}

function requiresManualReview(score) {
  return score >= 60;
}

module.exports = { computeFraudScore, requiresManualReview };
