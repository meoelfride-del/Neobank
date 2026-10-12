// Données publiques uniquement : jamais de clés ou d'identifiants techniques.
export const legalEntity = {
  name: import.meta.env.VITE_LEGAL_COMPANY_NAME || '',
  form: import.meta.env.VITE_LEGAL_COMPANY_FORM || '',
  capital: import.meta.env.VITE_LEGAL_CAPITAL || '',
  registration: import.meta.env.VITE_LEGAL_REGISTRATION || '',
  address: import.meta.env.VITE_LEGAL_ADDRESS || '',
  country: import.meta.env.VITE_LEGAL_COUNTRY || '',
  publisher: import.meta.env.VITE_LEGAL_PUBLISHER || '',
  contact: import.meta.env.VITE_LEGAL_CONTACT || '',
  regulator: import.meta.env.VITE_LEGAL_REGULATOR || '',
  authorization: import.meta.env.VITE_LEGAL_AUTHORIZATION || '',
  complaints: import.meta.env.VITE_LEGAL_COMPLAINTS || '',
  privacyContact: import.meta.env.VITE_LEGAL_PRIVACY_CONTACT || '',
  retention: import.meta.env.VITE_LEGAL_RETENTION || '',
};
