/**
 * Chatbot bancaire simulé. Remplace un appel à l'API OpenAI/LangChain.
 * Répond aux requêtes basiques par correspondance de mots-clés et
 * conserve un indicateur de demande sensible, sans transmission humaine.
 */
const RULES = [
  { keywords: ['solde', 'balance'], reply: "Vous pouvez consulter les soldes enregistrés pour vos comptes depuis l’onglet Tableau de bord." },
  { keywords: ['virement', 'transfert', 'envoyer'], reply: "L’onglet Transfert enregistre vos demandes par IBAN ou téléphone. Un code OTP et une décision administrateur sont nécessaires. Ce module ne se connecte pas à un réseau de paiement externe." },
  { keywords: ['carte', 'bloquer', 'perdue', 'volée'], reply: "L’onglet Cartes permet de modifier le statut enregistré d’une carte. Ce module n’est pas connecté à un émetteur bancaire ; pour une carte émise ailleurs, contactez son émetteur." },
  { keywords: ['frais', 'tarif', 'coût'], reply: "Ce module ne calcule pas de frais bancaires ni de devis de change. Les conditions tarifaires du service concerné doivent être confirmées avant une opération." },
  { keywords: ['kyc', 'identité', 'vérification'], reply: "Votre demande d’accès est revue par un administrateur. Ce parcours ne collecte pas de document d’identité et ne constitue pas une vérification documentaire réglementaire." },
  { keywords: ['budget', 'dépense', 'catégorie'], reply: "Votre budget est catégorisé automatiquement (Alimentation, Logement, Loisirs...). Consultez l'onglet Budget pour le détail et les alertes." },
];

const ESCALATION_TRIGGERS = ['fraude', 'litige', 'réclamation', 'urgent', 'conseiller', 'humain', 'plainte'];

function getBotReply(message) {
  const lower = message.toLowerCase();

  const needsEscalation = ESCALATION_TRIGGERS.some((t) => lower.includes(t));
  if (needsEscalation) {
    return {
      reply: "Votre message est enregistré, sans transmission à un conseiller. Aucun suivi humain n’est disponible dans cette conversation. Pour un incident bancaire, contactez votre établissement par son canal officiel.",
      escalated: true,
    };
  }

  const rule = RULES.find((r) => r.keywords.some((k) => lower.includes(k)));
  if (rule) return { reply: rule.reply, escalated: false };

  return {
    reply: "Mes réponses sont prédéfinies. Essayez une question sur les comptes, cartes, transferts ou budgets. Aucun conseiller humain n’est connecté.",
    escalated: false,
  };
}

module.exports = { getBotReply };
