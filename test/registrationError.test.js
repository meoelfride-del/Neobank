import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationError } from '../src/services/registrationError.js';

test('identifie une panne du service même si le proxy renvoie du HTML', () => {
  for (const status of [502, 503, 504]) {
    assert.match(registrationError({ response: { status, data: '<html>Gateway error</html>' } }), /temporairement indisponible/);
  }
  assert.match(registrationError({ code: 'ERR_NETWORK' }), /temporairement indisponible/);
});

test('conserve les erreurs de validation et les conflits de compte', () => {
  assert.equal(registrationError({ response: { status: 422, data: { details: ['Adresse requise.', 'Téléphone invalide.'] } } }), 'Adresse requise. Téléphone invalide.');
  assert.equal(registrationError({ response: { status: 409, data: { error: 'Cette adresse e-mail est déjà utilisée.' } } }), 'Cette adresse e-mail est déjà utilisée.');
});

test('traite les réponses inattendues sans provoquer une nouvelle exception', () => {
  assert.match(registrationError({ response: { status: 500, data: { details: 'incorrect' } } }), /Impossible de terminer/);
  assert.match(registrationError({ code: 'ECONNABORTED' }), /essayez de vous connecter/);
  assert.match(registrationError({ response: { status: 429 } }), /Trop de tentatives/);
});
