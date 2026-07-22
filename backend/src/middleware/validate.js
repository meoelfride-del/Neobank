const Joi = require('joi');

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

const schemas = {
  register: Joi.object({
    nom: Joi.string().min(2).max(60).required(),
    prenom: Joi.string().min(2).max(60).required(),
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(8).max(72).required(),
    phone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
  }),
  login: Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).required(),
    password: Joi.string().required(),
    otp: Joi.string().length(6).optional(),
  }),
  transfer: Joi.object({
    source_account_id: Joi.string().required(),
    destination_type: Joi.string().valid('iban', 'phone').required(),
    destination_info: Joi.string().required(),
    amount: Joi.number().positive().max(1000000).required(),
    libelle: Joi.string().max(140).allow('', null),
  }),
  scheduledPayment: Joi.object({
    account_id: Joi.string().required(),
    destination_info: Joi.string().required(),
    amount: Joi.number().positive().required(),
    label: Joi.string().max(140).required(),
    frequency: Joi.string().valid('mensuel', 'hebdomadaire').required(),
  }),
  cardToggle: Joi.object({
    status: Joi.string().valid('Active', 'Blocked').required(),
  }),
  cardCreate: Joi.object({
    account_id: Joi.string().required(),
    type: Joi.string().valid('Physique', 'Virtuelle').required(),
    pin: Joi.string().pattern(/^[0-9]{4}$/).required(),
    limits: Joi.number().positive().max(1000000).optional(),
  }),
  adminKycDecision: Joi.object({
    decision: Joi.string().valid('verified', 'rejected').required(),
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
