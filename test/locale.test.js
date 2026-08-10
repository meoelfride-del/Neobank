import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, normalizeLanguage, resolveLanguage } from '../src/i18n/locale.js';

test('normalise les variantes régionales', () => {
  assert.equal(normalizeLanguage('pt-BR'), 'pt');
  assert.equal(normalizeLanguage('FR_be'), 'fr');
  assert.equal(normalizeLanguage('ja-JP'), null);
});

test('respecte la priorité stockage, compte, navigateur, fallback', () => {
  assert.equal(resolveLanguage({ stored: 'de-DE', account: 'en', browserLanguages: ['fr-FR'] }), 'de');
  assert.equal(resolveLanguage({ account: 'pl-PL', browserLanguages: ['en-US'] }), 'pl');
  assert.equal(resolveLanguage({ browserLanguages: ['ja-JP', 'ru-RU'] }), 'ru');
  assert.equal(resolveLanguage(), 'fr');
});

test('formate les devises sans concaténation manuelle', () => {
  assert.match(formatCurrency(1250.5, 'EUR', 'fr'), /1[\s\u202f]250,50\s€/);
  assert.match(formatCurrency(1250.5, 'EUR', 'de'), /1\.250,50\s€/);
});

