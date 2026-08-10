import resources from '../src/i18n/resources.js';

function flatten(value, prefix = '', result = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, result);
    else result.add(path);
  }
  return result;
}

const reference = flatten(resources.fr.translation);
let failed = false;
for (const [language, resource] of Object.entries(resources)) {
  const keys = flatten(resource.translation);
  const missing = [...reference].filter((key) => !keys.has(key));
  if (missing.length) {
    failed = true;
    console.error(`${language}: ${missing.length} clé(s) absente(s): ${missing.join(', ')}`);
  }
}
if (failed) process.exitCode = 1;
else console.log(`${Object.keys(resources).length} langues valides; ${reference.size} clés de référence.`);

