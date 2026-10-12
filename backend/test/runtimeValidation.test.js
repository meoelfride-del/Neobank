const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntime } = require('../src/config/runtimeValidation');
const config = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:synthetic@localhost/isolated',
  JWT_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64), ENCRYPTION_KEY: 'c'.repeat(64), SMS_ENABLED: 'false' };
test('production : clés indépendantes, obligatoires et sans valeurs d’exemple', () => {
  assert.doesNotThrow(() => validateRuntime(config));
  for (const field of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
    assert.throws(() => validateRuntime({ ...config, [field]: '' }), new RegExp(field));
    assert.throws(() => validateRuntime({ ...config, [field]: 'change_this_super_secret_key_in_production' }), new RegExp(field));
  }
  assert.throws(() => validateRuntime({ ...config, JWT_REFRESH_SECRET: config.JWT_SECRET }), /distinctes/);
  assert.throws(() => validateRuntime({ ...config, DATABASE_URL: 'pg-mem://' }), /PostgreSQL/);
});
test('production : SMS activés seulement avec configuration TextBee complète', () => {
  assert.throws(() => validateRuntime({ ...config, SMS_ENABLED: 'true', SMS_PROVIDER: 'textbee' }), /TextBee/);
  assert.doesNotThrow(() => validateRuntime({ ...config, SMS_ENABLED: 'true', SMS_PROVIDER: 'textbee', TEXTBEE_API_KEY: 'synthetic', TEXTBEE_DEVICE_ID: '1'.repeat(24) }));
});
