function notFound(req, res) {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || 'Une erreur interne est survenue.',
  });
}

module.exports = { notFound, errorHandler };
