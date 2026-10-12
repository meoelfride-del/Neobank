function validateRuntime(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  for (const name of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
    const value = env[name] || '';
    if (value.length < 32 || /change_this|generate_your|development-key/i.test(value)) {
      throw new Error(`Configuration de production invalide : ${name}.`);
    }
  }
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) throw new Error('Les clés JWT de production doivent être distinctes.');
  if (!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL || '')) throw new Error('PostgreSQL est obligatoire en production.');
  if (env.SMS_ENABLED === 'true' && env.SMS_PROVIDER === 'textbee'
    && (!env.TEXTBEE_API_KEY?.trim() || !/^[a-f0-9]{24}$/i.test(env.TEXTBEE_DEVICE_ID || ''))) {
    throw new Error('Configuration TextBee incomplète : désactivez l’envoi ou configurez les accès.');
  }
}
module.exports = { validateRuntime };
