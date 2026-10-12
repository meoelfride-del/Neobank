export function registrationError(error) {
  const status = error.response?.status;
  if (error.code === 'ERR_NETWORK' || status === 502 || status === 503 || status === 504) {
    return "Le service d'inscription est temporairement indisponible. Réessayez dans quelques minutes.";
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return "Le service met trop de temps à répondre. Vérifiez votre connexion puis réessayez. Si le problème persiste, essayez de vous connecter avant de renouveler l'inscription.";
  }
  const data = error.response?.data;
  if (Array.isArray(data?.details)) {
    const details = data.details.filter((detail) => typeof detail === 'string');
    if (details.length) return details.join(' ');
  }
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (status === 429) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  return "Impossible de terminer l'inscription. Réessayez plus tard ou contactez le support.";
}
