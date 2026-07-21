const fs = require('node:fs');
const path = require('node:path');

const distDir = path.resolve(__dirname, '..', 'dist');
const entryFile = path.join(distDir, 'index.html');
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
  'mentions-legales',
  'confidentialite',
  'conditions-utilisation',
];

if (!fs.existsSync(entryFile)) {
  throw new Error(`Entrée Vite introuvable : ${entryFile}`);
}

for (const route of routes) {
  const routeDir = path.join(distDir, route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.copyFileSync(entryFile, path.join(routeDir, 'index.html'));
}

console.log(`[build] ${routes.length} routes SPA générées.`);
