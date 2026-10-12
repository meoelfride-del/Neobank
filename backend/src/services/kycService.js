const db = require('../config/database');
const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const { encryptDocument, decryptDocument } = require('./kycCrypto');

function fail(status, message) { return Object.assign(new Error(message), { status, publicMessage: message }); }
async function log(actor, action, userId, documentId) {
  await db.prepare('INSERT INTO audit_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), actor, action, JSON.stringify({ userId, documentId }));
}

async function dossier(userId) {
  const user = await db.prepare('SELECT id, nom, prenom, email, phone, status_kyc FROM users WHERE id = ?').get(userId);
  if (!user) throw fail(404, 'Utilisateur introuvable.');
  const profile = await db.prepare('SELECT * FROM customer_profiles WHERE user_id = ?').get(userId);
  const document = await db.prepare(`SELECT id, document_type, mime_type, byte_size, uploaded_at,
    review_reason, reviewed_at, (back_payload_encrypted IS NOT NULL) AS has_back FROM kyc_documents WHERE user_id = ?`).get(userId);
  return { user, profile: profile || null, document: document || null };
}

async function saveProfile(userId, profile) {
  await db.transaction(async () => {
    const user = await db.prepare('SELECT status_kyc FROM users WHERE id = ? FOR UPDATE').get(userId);
    if (!user) throw fail(404, 'Utilisateur introuvable.');
    if (!['pending', 'rejected'].includes(user.status_kyc)) throw fail(409, 'Le profil ne peut plus être modifié pendant la revue ou après validation.');
    await db.prepare(`INSERT INTO customer_profiles
      (user_id, birth_date, birth_place, nationality, address_line, city, postal_code, country, occupation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET birth_date=EXCLUDED.birth_date, birth_place=EXCLUDED.birth_place,
      nationality=EXCLUDED.nationality, address_line=EXCLUDED.address_line, city=EXCLUDED.city,
      postal_code=EXCLUDED.postal_code, country=EXCLUDED.country, occupation=EXCLUDED.occupation`)
      .run(userId, profile.birth_date, profile.birth_place, profile.nationality, profile.address_line,
        profile.city, profile.postal_code, profile.country, profile.occupation);
    // Invalide aussi la version du dossier : une revue ancienne ne doit pas
    // approuver des informations personnelles modifiées depuis son ouverture.
    const documentId = randomUUID();
    await db.prepare('UPDATE kyc_documents SET id=? WHERE user_id=?').run(documentId, userId);
    await log(userId, 'kyc_profile_update', userId, documentId);
  })();
}

async function normalizePhoto(file) {
  let bytes;
  try {
    const image = sharp(file.buffer, { limitInputPixels: 20_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    const expected = file.mimetype === 'image/png' ? 'png' : 'jpeg';
    if (metadata.format !== expected || (metadata.pages || 1) !== 1) throw new Error('format');
    bytes = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  } catch { throw fail(422, 'Photo invalide : utilisez une image JPEG ou PNG lisible, non animée, de 20 mégapixels maximum.'); }
  return bytes;
}

async function saveDocument(userId, file, documentType, backFile) {
  if (documentType !== 'passport' && !backFile) throw fail(422, 'Ajoutez les photos du recto et du verso.');
  const bytes = await normalizePhoto(file);
  const backBytes = documentType !== 'passport' ? await normalizePhoto(backFile) : null;
  const backEncrypted = backBytes ? encryptDocument(backBytes) : null;
  const encrypted = encryptDocument(bytes);
  const id = randomUUID();
  await db.transaction(async () => {
    const user = await db.prepare('SELECT status_kyc FROM users WHERE id = ? FOR UPDATE').get(userId);
    if (!user) throw fail(404, 'Utilisateur introuvable.');
    if (!['pending', 'rejected'].includes(user.status_kyc)) throw fail(409, 'Le document est verrouillé pendant la revue ou après validation.');
    await db.prepare(`INSERT INTO kyc_documents (id, user_id, document_type, mime_type, byte_size, payload_encrypted, back_payload_encrypted)
      VALUES (?, ?, ?, 'image/jpeg', ?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET id=EXCLUDED.id, document_type=EXCLUDED.document_type,
      mime_type=EXCLUDED.mime_type, byte_size=EXCLUDED.byte_size, payload_encrypted=EXCLUDED.payload_encrypted, back_payload_encrypted=EXCLUDED.back_payload_encrypted,
      uploaded_at=CURRENT_TIMESTAMP, review_reason=NULL, reviewed_by=NULL, reviewed_at=NULL`)
      .run(id, userId, documentType, bytes.length + (backBytes?.length || 0), encrypted, backEncrypted);
    await db.prepare("UPDATE users SET status_kyc='pending' WHERE id = ?").run(userId);
    await log(userId, 'kyc_document_upload', userId, id);
  })();
  return id;
}

async function submitKyc(userId) {
  return db.transaction(async () => {
    const user = await db.prepare('SELECT status_kyc FROM users WHERE id = ? FOR UPDATE').get(userId);
    if (!user) throw fail(404, 'Utilisateur introuvable.');
    if (user.status_kyc !== 'pending') return { status: user.status_kyc };
    const profile = await db.prepare('SELECT user_id FROM customer_profiles WHERE user_id = ?').get(userId);
    const document = await db.prepare('SELECT id FROM kyc_documents WHERE user_id = ?').get(userId);
    if (!profile || !document) throw fail(422, 'Complétez votre profil et déposez une photo avant de soumettre le KYC.');
    await db.prepare("UPDATE users SET status_kyc='in_review' WHERE id = ?").run(userId);
    await log(userId, 'kyc_submit', userId, document.id);
    return { status: 'in_review' };
  })();
}

async function review(userId, actorId, { decision, documentId, reason }) {
  return db.transaction(async () => {
    const user = await db.prepare('SELECT status_kyc FROM users WHERE id = ? FOR UPDATE').get(userId);
    if (!user) throw fail(404, 'Utilisateur introuvable.');
    const document = await db.prepare('SELECT id FROM kyc_documents WHERE user_id = ?').get(userId);
    if ((document?.id || null) !== (documentId || null)) throw fail(409, 'Le document a changé. Rechargez le dossier avant de décider.');
    if (decision !== 'pending') {
      const profile = await db.prepare('SELECT user_id FROM customer_profiles WHERE user_id = ?').get(userId);
      if (!document || !profile) throw fail(422, 'Le dossier KYC est incomplet.');
      if (user.status_kyc === decision) return { status: decision };
      if (user.status_kyc !== 'in_review') throw fail(409, 'Seul un dossier soumis peut être validé ou refusé.');
    } else if (!['in_review', 'verified'].includes(user.status_kyc)) {
      throw fail(409, 'Seul un dossier en revue ou validé peut être annulé.');
    }
    await db.prepare('UPDATE users SET status_kyc = ? WHERE id = ?').run(decision, userId);
    if (document) await db.prepare(`UPDATE kyc_documents SET review_reason=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(reason || null, actorId, document.id);
    await log(actorId, decision === 'pending' ? 'kyc_cancel' : 'kyc_review', userId, document?.id || null);
    if (decision === 'verified') await require('./smsService').enqueue(userId, 'kyc:' + document.id,
      'NEO BANK : votre dossier KYC est validé. Consultez votre espace pour connaître les services disponibles.');
    return { status: decision };
  })();
}

async function readDocument(userId, actorId, download, side = 'front') {
  if (!['front', 'back'].includes(side)) throw fail(422, 'Face du document invalide.');
  const document = await db.prepare('SELECT id, payload_encrypted, back_payload_encrypted FROM kyc_documents WHERE user_id = ?').get(userId);
  if (!document) throw fail(404, 'Aucun document KYC déposé.');
  const payload = side === 'back' ? document.back_payload_encrypted : document.payload_encrypted;
  if (!payload) throw fail(404, 'Aucune photo du verso déposée.');
  const bytes = decryptDocument(payload);
  await log(actorId, download ? 'kyc_document_download' : 'kyc_document_view', userId, document.id);
  return { id: document.id, bytes };
}
module.exports = { submitKyc, dossier, saveProfile, saveDocument, review, readDocument };
