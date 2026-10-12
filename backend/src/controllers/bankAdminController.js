const db=require('../config/database');const crypto=require('node:crypto');const bcrypt=require('bcryptjs');const {encrypt,decrypt}=require('../services/cryptoService');const {maskCard}=require('./cardController');
function fail(status,publicMessage){return Object.assign(new Error(publicMessage),{status,publicMessage});}
async function audit(actor,action,id){await db.prepare('INSERT INTO audit_logs(id,user_id,action,details) VALUES(?,?,?,?)').run(crypto.randomUUID(),actor,action,JSON.stringify({id}));}
function fingerprint(number){if(!process.env.ENCRYPTION_KEY)throw fail(503,'Le stockage sécurisé des cartes doit être configuré.');return crypto.createHmac('sha256',process.env.ENCRYPTION_KEY).update('card-number:'+number).digest('hex');}
async function iban(req,res){
  try{const account=await db.transaction(async()=>{const current=await db.prepare('SELECT * FROM accounts WHERE id=? FOR UPDATE').get(req.params.accountId);if(!current)throw fail(404,'Compte introuvable.');if(current.iban_version!==req.body.version)throw fail(409,'Le compte a changé. Rechargez avant de modifier.');await db.prepare('UPDATE accounts SET iban=?,iban_version=iban_version+1 WHERE id=?').run(req.body.iban,current.id);await audit(req.user.id,'iban_assignment',current.id);return db.prepare('SELECT * FROM accounts WHERE id=?').get(current.id);})();req.app.get('io')?.to('user:'+account.user_id).emit('accounts:updated',{accountId:account.id});res.json({account,message:'IBAN attribué.'});}
  catch(error){if(error.code==='23505')throw fail(409,'Cet IBAN est déjà attribué.');throw error;}
}
async function cards(req,res){const account=await db.prepare('SELECT id FROM accounts WHERE id=?').get(req.params.accountId);if(!account)throw fail(404,'Compte introuvable.');const rows=await db.prepare('SELECT * FROM cards WHERE account_id=?').all(account.id);const requests=await db.prepare('SELECT * FROM card_requests WHERE account_id=?').all(account.id);res.set('Cache-Control','private, no-store');res.json({cards:rows.map(maskCard),requests});}
async function save(req,res){
  const body=req.body;const changing=Boolean(req.params.cardId);
  try{const card=await db.transaction(async()=>{
    let current;
    if(changing){current=await db.prepare('SELECT * FROM cards WHERE id=? FOR UPDATE').get(req.params.cardId);if(!current)throw fail(404,'Carte introuvable.');if(current.version!==body.version)throw fail(409,'La carte a changé. Rechargez avant de modifier.');}
    const accountId=current?.account_id||req.params.accountId;
    const account=await db.prepare('SELECT a.*,u.status_kyc,u.status_compte FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.id=? FOR UPDATE').get(accountId);
    if(!account)throw fail(404,'Compte introuvable.');
    if((!changing||body.number||body.status==='Active')&&!account.iban)throw fail(409,'Attribuez un IBAN avant la carte.');
    if((!changing||body.number||body.status==='Active')&&(account.status_kyc!=='verified'||account.status_compte!=='active'))throw fail(409,'Le client doit être actif avec un KYC validé.');
    const encrypted=body.number?encrypt(body.number):current.number_encrypted;
    const fp=body.number?fingerprint(body.number):current.number_fingerprint;
    if(body.number){
      const legacy=await db.prepare('SELECT id,number_encrypted,number_fingerprint FROM cards').all();
      for(const row of legacy)if(!row.number_fingerprint&&row.id!==current?.id&&decrypt(row.number_encrypted)===body.number)throw fail(409,'Ce numéro de carte est déjà attribué.');
    }
    const last4=body.number?body.number.slice(-4):current.last4;const id=current?.id||crypto.randomUUID();
    if(body.requestId){const request=await db.prepare('SELECT * FROM card_requests WHERE id=? FOR UPDATE').get(body.requestId);if(!request||request.account_id!==accountId||request.status!=='pending'||request.type!==body.type)throw fail(409,'Demande de carte indisponible ou type différent.');}
    if(changing)await db.prepare('UPDATE cards SET number_encrypted=?,number_fingerprint=?,last4=?,type=?,expiry=?,limits=?,status=?,version=version+1,admin_locked=? WHERE id=?').run(encrypted,fp,last4,body.type,body.expiry,body.limits,body.status,body.status !== 'Active',id);
    else await db.prepare('INSERT INTO cards(id,account_id,type,number_encrypted,last4,pin_hash,expiry,limits,status,number_fingerprint,admin_locked) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,accountId,body.type,encrypted,last4,await bcrypt.hash(crypto.randomUUID(),4),body.expiry,body.limits,body.status,fp,body.status !== 'Active');
    if(body.requestId)await db.prepare("UPDATE card_requests SET status='assigned',card_id=? WHERE id=?").run(id,body.requestId);
    await audit(req.user.id,changing?'card_update':'card_assignment',id);return db.prepare('SELECT * FROM cards WHERE id=?').get(id);
  })();const owner=await db.prepare('SELECT user_id FROM accounts WHERE id=?').get(card.account_id);req.app.get('io')?.to('user:'+owner.user_id).emit('cards:updated',{accountId:card.account_id});res.status(changing?200:201).json({card:maskCard(card),message:changing?'Carte modifiée.':'Carte attribuée.'});}
  catch(error){if(error.code==='23505')throw fail(409,'Ce numéro de carte est déjà attribué.');throw error;}
}
module.exports={iban,cards,save};


