const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'https://neobank-team-eig.vercel.app',
  'https://neo-finance.app',
  'https://www.neo-finance.app',
];

function normalizeOrigin(value) {
  return value
    .trim()
    .replace(/^CLIENT_URL\s*=\s*/i, '')
    .replace(/\/$/, '');
}

function getClientOrigins() {
  const configured = (process.env.CLIENT_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  return [...new Set([...DEFAULT_ORIGINS, ...configured])];
}

module.exports = { getClientOrigins };
