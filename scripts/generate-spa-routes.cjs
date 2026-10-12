const fs = require('node:fs');
const path = require('node:path');

const routes = [
  'login',
  'register',
  'onboarding',
  'dashboard',
  'accounts',
  'transfer',
  'cards',
  'budget',
  'chatbot',
  'admin',
  'security',
  'mentions-legales',
  'confidentialite',
  'conditions-utilisation',
];

function generateSpaRoutes(distDir = path.resolve(__dirname, '..', 'dist')) {
  const entryFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(entryFile)) {
    throw new Error(`Entrée Vite introuvable : ${entryFile}`);
  }

  for (const route of routes) {
    const routeDir = path.join(distDir, route);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.copyFileSync(entryFile, path.join(routeDir, 'index.html'));
  }

  return routes.length;
}

if (require.main === module) {
  console.log(`[build] ${generateSpaRoutes()} routes SPA générées.`);
}

module.exports = { generateSpaRoutes };
