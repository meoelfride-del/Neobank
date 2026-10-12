const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const stage = path.join(root, 'audit', 'release-stage-20261011');
if (fs.existsSync(stage)) throw new Error('Le dossier de livraison existe déjà ; il est conservé.');
const files = [];
function collect(relative) {
  const full = path.join(root, relative);
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error('Lien symbolique exclu de la livraison.');
  if (stat.isDirectory()) for (const entry of fs.readdirSync(full)) collect(path.join(relative, entry));
  else files.push(relative);
}
for (const directory of ['src', 'public', 'scripts', 'test', 'backend/src', 'backend/test']) collect(directory);
for (const file of ['index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'postcss.config.js', 'tailwind.config.js',
  'render.yaml', 'vercel.json', '.gitignore', '.vercelignore', '.node-version', '.env.example',
  'backend/package.json', 'backend/package-lock.json', 'backend/server.js', 'backend/.env.example', 'backend/.node-version',
  'RELEASE_READINESS.md', 'TEXTBEE_GUIDE.md', 'VALIDATION_GUIDE.md', 'BANKING_ADMIN_GUIDE.md', 'KYC_GUIDE.md', 'AUTH_MFA_GUIDE.md']) {
  if (fs.existsSync(path.join(root, file))) files.push(file);
}
files.push(path.join('audit', 'kyc-synthetic.jpg'));
const env = require(path.join(root, 'backend/node_modules/dotenv')).parse(fs.readFileSync(path.join(root, 'backend/.env')));
const secretNames = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'KYC_ENCRYPTION_KEY', 'ADMIN_PASSWORD', 'TEXTBEE_API_KEY', 'TWILIO_AUTH_TOKEN'];
const secrets = secretNames.map(key => env[key]).filter(value => value && value.length >= 16);
for (const relative of files) {
  const data = fs.readFileSync(path.join(root, relative));
  const matching = secretNames.filter(key => env[key]?.length >= 16 && data.includes(Buffer.from(env[key])));
  if (matching.length) throw new Error(`Valeur privée détectée dans ${relative} (${matching.join(', ')}) ; préparation annulée.`);
}
for (const asset of fs.readdirSync(path.join(root, 'dist/assets'))) {
  const bytes = fs.readFileSync(path.join(root, 'dist/assets', asset));
  if (secrets.some(secret => bytes.includes(Buffer.from(secret)))) throw new Error('Une valeur privée est présente dans le build frontend.');
}
const manifest = [];
for (const relative of files.sort()) {
  const data = fs.readFileSync(path.join(root, relative));
  const destination = path.join(stage, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, data);
  manifest.push({ path: relative.replace(/\\/g, '/'), bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
}
fs.writeFileSync(path.join(stage, 'release-manifest.json'), JSON.stringify({ date: '2026-10-11', files: manifest, secretsIncluded: false }, null, 2));
console.log(`Livraison préparée : ${files.length} fichiers ; secrets et données privées exclus.`);
