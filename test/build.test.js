import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { generateSpaRoutes } = require('../scripts/generate-spa-routes.cjs');
let stylesheet;

before(async () => {
  const from = path.join(root, 'src/index.css');
  stylesheet = await postcss([tailwind()]).process(await fs.readFile(from, 'utf8'), { from });
});

function rules(selector) {
  const matches = [];
  stylesheet.root.walkRules(selector, rule => matches.push(rule));
  return matches;
}

async function removeFixture(dir) {
  const resolved = path.resolve(dir);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.match(path.basename(resolved), /^neobank-(?:routes|missing-entry|invalid-css)-/);
  await fs.rm(resolved, { recursive: true, force: true });
}

test('compile les couleurs, polices et composants du thème existant', () => {
  assert.match(stylesheet.css, /#080b12/i);
  assert.match(stylesheet.css, /#16e0b0/i);
  assert.match(stylesheet.css, /Space Grotesk/);
  assert.match(stylesheet.css, /IBM Plex Mono/);
  for (const selector of ['.panel', '.btn-primary', '.input-field', '.amount-mono', '.bg-ink-900']) {
    assert.ok(rules(selector).length, `${selector} doit être compilé`);
  }
  const amounts = rules('.amount-mono')[0];
  assert.ok(amounts.nodes.some(node => node.prop === '--tw-numeric-spacing' && node.value === 'tabular-nums'));
  assert.ok(amounts.nodes.some(node => node.prop === 'font-variant-numeric' && node.value.includes('--tw-numeric-spacing')));
  assert.doesNotMatch(stylesheet.css, /@(?:apply|config|source|tailwind)\b/);
});

test('préserve le breakpoint mobile et les surcharges importantes existantes', () => {
  const xs = rules('.xs\\:grid-cols-2')[0];
  assert.ok(xs, 'la grille à deux colonnes xs doit exister');
  assert.equal(xs.parent.name, 'media');
  assert.match(xs.parent.params, /25rem/);
  const override = rules('.\\!px-3')[0];
  assert.ok(override, 'la syntaxe historique !px-3 doit rester compilée');
  assert.ok(override.nodes.some(node => node.type === 'decl' && node.important));
});

test('génère une entrée identique pour chaque route déclarée dans React', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neobank-routes-'));
  try {
    const html = '<!doctype html><script type="module" src="/assets/app.js"></script>';
    await fs.writeFile(path.join(dir, 'index.html'), html);
    const count = generateSpaRoutes(dir);
    const app = await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8');
    const paths = [...app.matchAll(/<Route path="(\/[^"]+)"/g)].map(match => match[1]);
    assert.equal(count, paths.length);
    for (const route of paths) {
      assert.equal(await fs.readFile(path.join(dir, route.slice(1), 'index.html'), 'utf8'), html);
    }
  } finally {
    await removeFixture(dir);
  }
});

test('refuse une entrée Vite manquante avant de créer les routes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neobank-missing-entry-'));
  try {
    assert.throws(() => generateSpaRoutes(dir), /Entrée Vite introuvable/);
    assert.deepEqual(await fs.readdir(dir), []);
  } finally {
    await removeFixture(dir);
  }
});

test('un échec CSS Vite conserve sa cause sans erreur de copie SPA', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neobank-invalid-css-'));
  try {
    await fs.writeFile(path.join(dir, 'index.html'), '<link rel="stylesheet" href="/broken.css">');
    await fs.writeFile(path.join(dir, 'broken.css'), '.broken { @apply audit-unknown-utility; }');
    const result = spawnSync(process.execPath, [
      path.join(root, 'node_modules/vite/bin/vite.js'), 'build', dir,
      '--config', path.join(root, 'vite.config.js'),
    ], { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(output, /unknown utility class.*audit-unknown-utility/);
    assert.doesNotMatch(output, /ENOENT|copyfile|spa-route-entries/);
  } finally {
    await removeFixture(dir);
  }
});
