/**
 * Chatbot bancaire simulé. Remplace un appel à l'API OpenAI/LangChain.
 * Répond aux requêtes basiques par correspondance de mots-clés et
 * signale les cas nécessitant une escalade humaine.
 */
const RULES = [
  { keywords: ['solde', 'balance'], reply: "Vous pouvez consulter votre solde en temps réel depuis l'onglet Tableau de bord. Souhaitez-vous que je vous y redirige ?" },
  { keywords: ['virement', 'transfert', 'envoyer'], reply: "Pour effectuer un virement, rendez-vous dans l'onglet Transfert. Vous pouvez envoyer par IBAN ou par numéro de téléphone pour un virement instantané." },
  { keywords: ['carte', 'bloquer', 'perdue', 'volée'], reply: "Vous pouvez bloquer votre carte immédiatement depuis l'onglet Cartes en activant le commutateur 'Bloquer'. Voulez-vous que j'escalade votre demande à un conseiller ?" },
  { keywords: ['frais', 'tarif', 'coût'], reply: "Nos comptes Courant sont sans frais de tenue de compte. Les virements instantanés internes sont gratuits et illimités." },
  { keywords: ['kyc', 'identité', 'vérification'], reply: "La vérification d'identité se fait dans l'onboarding. Le traitement automatisé prend généralement quelques instants." },
  { keywords: ['budget', 'dépense', 'catégorie'], reply: "Votre budget est catégorisé automatiquement (Alimentation, Logement, Loisirs...). Consultez l'onglet Budget pour le détail et les alertes." },
];

const ESCALATION_TRIGGERS = ['fraude', 'litige', 'réclamation', 'urgent', 'conseiller', 'humain', 'plainte'];

function getBotReply(message) {
  const lower = message.toLowerCase();

  const needsEscalation = ESCALATION_TRIGGERS.some((t) => lower.includes(t));
  if (needsEscalation) {
    return {
      reply: "Je transmets votre demande à un conseiller humain qui vous répondra sous peu. Merci de votre patience.",
      escalated: true,
    };
  }

  const rule = RULES.find((r) => r.keywords.some((k) => lower.includes(k)));
  if (rule) return { reply: rule.reply, escalated: false };

  return {
    reply: "Je n'ai pas bien compris votre demande. Pouvez-vous reformuler, ou souhaitez-vous être mis en relation avec un conseiller ?",
    escalated: false,
  };
}

module.exports = { getBotReply };
