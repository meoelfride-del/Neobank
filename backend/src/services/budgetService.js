/**
 * Catégorisation automatique des transactions (Personal Finance Management)
 * basée sur des expressions régulières appliquées au libellé.
 */
const CATEGORY_RULES = [
  { category: 'Alimentation', regex: /(carrefour|supermarch|monoprix|leclerc|restaurant|boulangerie|uber ?eats|deliveroo|epicerie)/i },
  { category: 'Logement', regex: /(loyer|edf|engie|electricit|eau|syndic|assurance habitation)/i },
  { category: 'Transport', regex: /(sncf|ratp|essence|total|uber(?! ?eats)|taxi|parking|peage)/i },
  { category: 'Loisirs', regex: /(netflix|spotify|cinema|concert|steam|playstation|voyage|hotel)/i },
  { category: 'Santé', regex: /(pharmacie|medecin|dentiste|mutuelle|hopital)/i },
  { category: 'Shopping', regex: /(amazon|zalando|fnac|decathlon|h&m|zara)/i },
  { category: 'Salaire', regex: /(salaire|paie|virement employeur)/i },
];

function categorize(libelle = '') {
  const rule = CATEGORY_RULES.find((r) => r.regex.test(libelle));
  return rule ? rule.category : 'Autre';
}

/** Regroupe les transactions par catégorie et calcule les totaux + alertes de seuil. */
function buildBudgetSummary(transactions, thresholds = {}) {
  const totals = {};
  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // on ne budgète que les dépenses
    const cat = tx.category || 'Autre';
    totals[cat] = (totals[cat] || 0) + Math.abs(tx.amount);
  }

  const summary = Object.entries(totals).map(([category, total]) => {
    const threshold = thresholds[category];
    return {
      category,
      total: Math.round(total * 100) / 100,
      threshold: threshold || null,
      alert: threshold ? total > threshold : false,
    };
  });

  return summary.sort((a, b) => b.total - a.total);
}

module.exports = { categorize, buildBudgetSummary };
