const Joi = require('joi');
const bankIds = require('../services/bankIdentifiers');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(422).json({
        error: 'Données invalides.',
        details: error.details.map((d) => d.message),
      });
    }
    req.body = value;
    next();
  };
}

const profileFields = {
  birth_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value
      || value > new Date().toISOString().slice(0, 10) || value < '1900-01-01'
      ? helpers.error('any.invalid') : value;
  }).required().messages({ 'any.invalid': 'La date de naissance doit être une date passée valide.' }),
  birth_place: Joi.string().trim().min(2).max(100).required(),
  nationality: Joi.string().trim().min(2).max(80).required(),
  address_line: Joi.string().trim().min(5).max(160).required(),
  city: Joi.string().trim().min(2).max(100).required(),
  postal_code: Joi.string().trim().max(20).allow('').default(''),
  country: Joi.string().trim().min(2).max(80).required(),
  occupation: Joi.string().trim().max(100).allow('').default(''),
};

const schemas = {
  adminIban: Joi.object({ iban: bankIds.iban, version: Joi.number().integer().min(0).required() }),
  adminCardAssign: Joi.object({ number: bankIds.cardNumber.required(), expiry: bankIds.expiry.required(), type: Joi.string().valid('Physique','Virtuelle').required(), limits: Joi.number().positive().max(1000000).required(), status: Joi.string().valid('Active','Blocked').default('Active'), requestId: Joi.string().guid().optional() }),
  adminCardUpdate: Joi.object({ number: bankIds.cardNumber.optional(), expiry: bankIds.expiryFormat.when('status',{is:'Active',then:bankIds.expiry}).required(), type: Joi.string().valid('Physique','Virtuelle').required(), limits: Joi.number().positive().max(1000000).required(), status: Joi.string().valid('Active','Blocked','Expired').required(), version: Joi.number().integer().min(1).required() }),
  mfaSetup: Joi.object({ password: Joi.string().max(72).required() }),
  mfaEnable: Joi.object({ password: Joi.string().max(72).required(), otp: Joi.string().pattern(/^[0-9]{6}$/).required() }),
  register: Joi.object({
    nom: Joi.string().min(2).max(60).required(),
    prenom: Joi.string().min(2).max(60).required(),
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(8).max(72).custom((value, helpers) => Buffer.byteLength(value, 'utf8') > 72 ? helpers.error('string.max', { limit: 72 }) : value).required(),
    phone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
    ...profileFields,
    accept_terms: Joi.boolean().valid(true).required(),
  }),
  kycProfile: Joi.object(profileFields),
  kycUpload: Joi.object({ document_type: Joi.string().valid('identity_card', 'passport', 'residence_permit').required() }),
  login: Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().required(),
    otp: Joi.string().length(6).optional(),
  }),
  refreshSession: Joi.object({
    refreshToken: Joi.string().min(20).max(4096).required(),
  }),
  transfer: Joi.object({
    source_account_id: Joi.string().required(),
    destination_type: Joi.string().valid('iban', 'phone').required(),
    destination_info: Joi.string().trim().when('destination_type', { is: 'iban', then: bankIds.iban, otherwise: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required() }),
    amount: Joi.number().positive().precision(2).max(1000000).required(),
    libelle: Joi.string().max(140).allow('', null),
  }),
  scheduledPayment: Joi.object({
    account_id: Joi.string().required(),
    destination_info: Joi.string().required(),
    amount: Joi.number().positive().precision(2).max(1000000).required(),
    label: Joi.string().max(140).required(),
    frequency: Joi.string().valid('mensuel', 'hebdomadaire').required(),
  }),
  cardToggle: Joi.object({
    status: Joi.string().valid('Active', 'Blocked').required(),
  }),
  cardCreate: Joi.object({
    account_id: Joi.string().required(),
    type: Joi.string().valid('Physique', 'Virtuelle').required(),
    pin: Joi.string().pattern(/^[0-9]{4}$/).optional(),
    limits: Joi.number().positive().max(1000000).optional(),
  }),
  adminKycDecision: Joi.object({
    decision: Joi.string().valid('verified', 'rejected', 'pending').required(),
    documentId: Joi.string().guid().when('decision', { is: 'pending', then: Joi.optional(), otherwise: Joi.required() }),
    reason: Joi.string().trim().max(500).when('decision', { is: 'verified', then: Joi.allow('').default(''), otherwise: Joi.string().min(3).required() }),
  }),
  adminSuspendUser: Joi.object({
    suspended: Joi.boolean().required(),
  }),
  adminUpdateUser: Joi.object({
    nom: Joi.string().min(2).max(60).required(),
    prenom: Joi.string().min(2).max(60).required(),
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    phone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
  }),
  adminBalanceAdjustment: Joi.object({
    operation: Joi.string().valid('credit', 'debit').required(),
    amount: Joi.number().positive().precision(2).max(1000000).required(),
    reason: Joi.string().trim().min(3).max(140).required(),
  }),
  adminTransactionReview: Joi.object({
    approve: Joi.boolean().required(),
  }),
  adminTransferOtp: Joi.object({
    message: Joi.string().trim().min(5).max(500).required(),
    expiresInMinutes: Joi.number().integer().min(5).max(60).default(15),
  }),
  adminNotification: Joi.object({
    title: Joi.string().trim().min(3).max(100).required(),
    message: Joi.string().trim().min(3).max(1000).required(),
    kind: Joi.string().valid('info', 'success', 'warning', 'security').default('info'),
    actionUrl: Joi.string().pattern(/^\/[a-zA-Z0-9/_-]*$/).allow('', null).default(null),
  }),
  transferOtpVerification: Joi.object({
    otp: Joi.string().pattern(/^[0-9]{6}$/).required(),
  }),
  chatMessage: Joi.object({
    content: Joi.string().min(1).max(500).required(),
  }),
  accountCreate: Joi.object({
    type: Joi.string().valid('Courant', 'Epargne').required(),
    currency: Joi.string().valid('EUR', 'USD', 'GBP').required(),
    label: Joi.string().max(60).required(),
  }),
};

module.exports = { validate, schemas };

