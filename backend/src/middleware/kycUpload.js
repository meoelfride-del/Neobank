const multer = require('multer');
const rateLimit = require('express-rate-limit');

const MAX_KYC_BYTES = 5 * 1024 * 1024;
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KYC_BYTES, files: 2, fields: 1, parts: 3, fieldSize: 100 },
  fileFilter(req, file, cb) {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      return cb(Object.assign(new Error('Photo JPEG ou PNG uniquement.'), { status: 422, publicMessage: 'Photo JPEG ou PNG uniquement.' }));
    }
    cb(null, true);
  },
}).fields([{ name: 'document', maxCount: 1 }, { name: 'document_back', maxCount: 1 }]);

function uploadKyc(req, res, next) {
  parser(req, res, error => {
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 422).json({
        error: error.code === 'LIMIT_FILE_SIZE' ? 'La photo ne doit pas dépasser 5 Mo.' : 'Envoyez une photo du recto et une du verso, avec le type de document.',
      });
    }
    if (error) return next(error);
    req.file = req.files?.document?.[0];
    req.backFile = req.files?.document_back?.[0];
    if (req.body.document_type !== 'passport' && !req.backFile) return res.status(422).json({ error: 'Ajoutez les photos du recto et du verso.' });
    if (!req.file) return res.status(422).json({ error: 'Une photo du document est obligatoire.' });
    next();
  });
}
const kycUploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 12, keyGenerator: req => req.user.id,
  message: { error: 'Trop de dépôts. Réessayez plus tard.' } });
module.exports = { uploadKyc, kycUploadLimiter, MAX_KYC_BYTES };
