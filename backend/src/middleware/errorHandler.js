function notFound(req, res) {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error('[server-error]', JSON.stringify({
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    status,
    name: err.name || 'Error',
    message: String(err.message || 'Erreur inconnue').replace(/[\r\n\u2028\u2029]/g, ' ').slice(0, 500),
  }));
  res.status(status).json({
    error: err.publicMessage || 'Une erreur interne est survenue.',
    requestId: req.id,
  });
}

module.exports = { notFound, errorHandler };

