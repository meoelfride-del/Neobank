const service = require('../services/kycService');
async function status(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const result = await service.dossier(req.user.id);
  res.json({ ...result, status_kyc: result.user.status_kyc });
}
async function profile(req, res) {
  await service.saveProfile(req.user.id, req.body);
  res.json({ message: 'Profil enregistré.' });
}
async function upload(req, res) {
  const id = await service.saveDocument(req.user.id, req.file, req.body.document_type, req.backFile);
  res.status(201).json({ message: 'Photo enregistrée. Soumettez le dossier pour sa revue.', documentId: id });
}
async function adminDossier(req, res) { res.set('Cache-Control', 'private, no-store'); res.json(await service.dossier(req.params.userId)); }
async function document(req, res) {
  const download = req.query.download === 'true';
  const target = req.params.userId || req.user.id;
  const result = await service.readDocument(target, req.user.id, download, req.query.side || 'front');
  res.set({ 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache',
    'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="kyc-${result.id}-${req.query.side === 'back' ? 'verso' : 'recto'}.jpg"`,
    'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.send(result.bytes);
}
module.exports = { status, profile, upload, adminDossier, document };
