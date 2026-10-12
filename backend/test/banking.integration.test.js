const {before,after,test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const jwt=require('jsonwebtoken');const bcrypt=require('bcryptjs');
process.env.NODE_ENV='test';process.env.DATABASE_URL='pg-mem://';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.JWT_REFRESH_SECRET=crypto.randomBytes(32).toString('hex');process.env.ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
const db=require('../src/config/database');const app=require('../src/app');const {queueDuePayments}=require('../src/services/cronService');let server,base,admin,client,other,source,destination;
async function token(id){const sid=crypto.randomUUID();await db.prepare('INSERT INTO refresh_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)').run(sid,id,'synthetic',new Date(Date.now()+3600000).toISOString());return jwt.sign({sub:id,type:'access',sid},process.env.JWT_SECRET,{expiresIn:'1h'});}
async function req(path,auth,method='GET',body,key){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth,...(path==='/transactions/transfer'?{'Idempotency-Key':key||crypto.randomUUID()}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
async function account(id){return db.prepare('SELECT * FROM accounts WHERE id=?').get(id);}
async function issue(txId,message='Confirmez cette opération sortante'){const r=await req('/admin/transactions/'+txId+'/otp',admin.token,'POST',{message,expiresInMinutes:15});assert.equal(r.status,201,JSON.stringify(r.body));return r.body.otp;}
async function confirm(txId,otp){return req('/transactions/'+txId+'/verify-otp',client.token,'POST',{otp});}
async function approve(txId,yes=true){return req('/admin/transactions/'+txId+'/review',admin.token,'POST',{approve:yes});}
before(async()=>{await db.initDatabase();server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port+'/api';let index=0;const users=[];for(const role of ['admin','client','client']){const id=crypto.randomUUID();index++;await db.prepare('INSERT INTO users(id,nom,prenom,email,password_hash,phone,role,status_kyc) VALUES(?,?,?,?,?,?,?,?)').run(id,'Synthétique','Test','bank'+index+'@example.test',await bcrypt.hash('Synthetic123!',4),'+2290000000'+index,role,'verified');users.push({id,token:await token(id)});} [admin,client,other]=users;source=crypto.randomUUID();destination=crypto.randomUUID();await db.prepare("INSERT INTO accounts(id,user_id,type,currency,balance,iban,label) VALUES(?,?,'Courant','EUR',100,NULL,'Source')").run(source,client.id);await db.prepare("INSERT INTO accounts(id,user_id,type,currency,balance,iban,label) VALUES(?,?,'Courant','EUR',0,NULL,'Destination')").run(destination,other.id);});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();});

test('IBAN : réservé à admin, format valide, attribution, doublon et version',async()=>{
  assert.equal((await account(source)).iban,null);
  assert.equal((await req('/admin/accounts/'+source+'/iban',client.token,'PATCH',{iban:'FR1420041010050500013M02606',version:0})).status,403);
  assert.equal((await req('/admin/accounts/'+source+'/iban',admin.token,'PATCH',{iban:'FR000',version:0})).status,422);
  assert.equal((await req('/admin/accounts/'+source+'/iban',admin.token,'PATCH',{iban:'FR14 2004 1010 0505 0001 3M02 606',version:0})).status,200);
  assert.equal((await account(source)).iban,'FR1420041010050500013M02606');
  assert.equal((await req('/admin/accounts/'+destination+'/iban',admin.token,'PATCH',{iban:'FR1420041010050500013M02606',version:0})).status,409);
  assert.equal((await req('/admin/accounts/'+source+'/iban',admin.token,'PATCH',{iban:'GB82WEST12345698765432',version:0})).status,409);
  assert.equal((await req('/admin/accounts/'+source+'/iban',admin.token,'PATCH',{iban:'GB82WEST12345698765432',version:1})).status,200);
  assert.equal((await req('/admin/accounts/'+destination+'/iban',admin.token,'PATCH',{iban:'DE89370400440532013000',version:0})).status,200);
});

test('carte : demande sans émission, attribution manuelle et modification chiffrée',async()=>{
  const requested=await req('/cards',client.token,'POST',{account_id:source,type:'Physique'});assert.equal(requested.status,201);assert.equal(requested.body.card,undefined);
  assert.equal((await req('/cards/account/'+source,client.token)).body.cards.length,0);
  const data={number:'4111111111111111',expiry:'12/'+(new Date().getFullYear()+4),type:'Physique',limits:1000,requestId:requested.body.request.id};
  assert.equal((await req('/admin/accounts/'+source+'/cards',client.token,'POST',data)).status,403);
  assert.equal((await req('/admin/accounts/'+source+'/cards',admin.token,'POST',{...data,number:'4111111111111112'})).status,422);
  const assigned=await req('/admin/accounts/'+source+'/cards',admin.token,'POST',data);assert.equal(assigned.status,201,JSON.stringify(assigned.body));const card=assigned.body.card;
  assert.ok(!JSON.stringify(assigned.body).includes(data.number));assert.equal(card.number_encrypted,undefined);assert.equal(card.pin_hash,undefined);assert.equal(card.number_fingerprint,undefined);
  const stored=await db.prepare('SELECT number_encrypted FROM cards WHERE id=?').get(card.id);assert.notEqual(stored.number_encrypted,data.number);
  assert.equal((await req('/admin/accounts/'+destination+'/cards',admin.token,'POST',{...data,requestId:undefined})).status,409);
  const changed={type:'Physique',number:'5555555555554444',expiry:data.expiry,limits:500,status:'Blocked',version:card.version};
  const update=await req('/admin/cards/'+card.id,admin.token,'PATCH',changed);assert.equal(update.status,200);assert.equal(update.body.card.last4,'4444');assert.equal(update.body.card.limits,500);
  assert.equal((await req('/admin/cards/'+card.id,admin.token,'PATCH',changed)).status,409);
  assert.equal((await req('/cards/'+card.id+'/status',client.token,'PATCH',{status:'Active'})).status,409);
  const reveal=await req('/cards/'+card.id+'/reveal',client.token,'POST',{password:'Synthetic123!'});assert.equal(reveal.body.fullNumber,changed.number);
  assert.equal((await req('/cards/'+card.id+'/reveal',other.token,'POST',{password:'Synthetic123!'})).status,403);
  assert.equal((await req('/cards/account/'+source,client.token)).body.requests[0].status,'assigned');
  const legacyId=crypto.randomUUID();
  await db.prepare("INSERT INTO cards(id,account_id,type,number_encrypted,last4,pin_hash,expiry,limits,status) VALUES(?,?,'Physique',?,'1881','unused',?,100,'Active')").run(legacyId,destination,require('../src/services/cryptoService').encrypt('4012888888881881'),data.expiry);
  assert.equal((await req('/admin/accounts/'+source+'/cards',admin.token,'POST',{...data,requestId:undefined,number:'4012888888881881'})).status,409);
});

test('virement : aucun débit avant OTP avec message, confirmation et approbation',async()=>{
  const payload={source_account_id:source,destination_type:'phone',destination_info:'+22900000003',amount:10,libelle:'Test OTP'};const key=crypto.randomUUID();const before=Number((await account(source)).balance);
  const created=await req('/transactions/transfer',client.token,'POST',payload,key);assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.transactionId;
  assert.equal((await db.prepare('SELECT id FROM sms_outbox WHERE event_key=?').all('transfer:'+id+':sent')).length,0);
  assert.equal(Number((await account(source)).balance),before);assert.equal(Number((await account(destination)).balance),0);
  assert.equal((await req('/transactions/transfer',client.token,'POST',{...payload,amount:11},key)).status,409);
  assert.equal((await approve(id)).status,409);
  assert.equal((await req('/admin/transactions/'+id+'/otp',admin.token,'POST',{expiresInMinutes:15})).status,422);
  assert.equal((await req('/admin/transactions/'+id+'/otp',client.token,'POST',{message:'Message test',expiresInMinutes:15})).status,403);
  const otp=await issue(id,'Confirmez les 10 euros vers le bénéficiaire');
  const rows=(await req('/transactions/account/'+source,client.token)).body.transactions;assert.equal(rows.find(row=>row.id===id).otp_message,'Confirmez les 10 euros vers le bénéficiaire');assert.ok(!JSON.stringify(rows).includes('code_hash'));
  assert.equal((await confirm(id,otp)).status,200);assert.equal(Number((await account(source)).balance),before);assert.equal((await confirm(id,otp)).status,409);
  assert.equal((await approve(id)).status,200);assert.equal(Number((await account(source)).balance),before-10);assert.equal(Number((await account(destination)).balance),10);
  assert.equal((await approve(id)).status,409);assert.equal(Number((await account(source)).balance),before-10);
  const sent = await db.prepare('SELECT user_id,status FROM sms_outbox WHERE event_key=?').get('transfer:'+id+':sent');
  const received = await db.prepare('SELECT user_id,status FROM sms_outbox WHERE event_key=?').get('transfer:'+id+':received');
  assert.equal(sent.user_id,client.id);assert.equal(sent.status,'pending');assert.equal(received.user_id,other.id);
  assert.equal((await req('/admin/sms',client.token)).status,403);
  assert.equal((await req('/admin/sms/diagnostics',client.token)).status,403);
  const monitoring = await req('/admin/sms',admin.token);assert.equal(monitoring.status,200);assert.ok(!JSON.stringify(monitoring.body).includes('recipient'));
});

test('OTP : cinq erreurs, renouvellement, expiration et annulation sans faux remboursement',async()=>{
  const before=Number((await account(source)).balance);const tx=await req('/transactions/transfer',client.token,'POST',{source_account_id:source,destination_type:'iban',destination_info:'DE89370400440532013000',amount:5,libelle:'Test tentatives'});const id=tx.body.transactionId;const otp=await issue(id);const bad=otp==='000000'?'111111':'000000';
  for(let n=0;n<5;n++)assert.equal((await confirm(id,bad)).status,401);
  assert.equal((await confirm(id,otp)).status,429);const renewed=await issue(id);assert.equal((await confirm(id,renewed)).status,200);
  await db.prepare('UPDATE transfer_challenges SET expires_at=? WHERE transaction_id=?').run('2000-01-01T00:00:00Z',id);
  assert.equal((await approve(id)).status,409);
  assert.equal((await req('/transactions/'+id+'/cancel',client.token,'POST')).status,200);assert.equal(Number((await account(source)).balance),before);
});

test('débit admin : en attente, OTP obligatoire, puis débit exact une fois',async()=>{
  const before=Number((await account(source)).balance);const request=await req('/admin/accounts/'+source+'/adjust-balance',admin.token,'POST',{operation:'debit',amount:7,reason:'Correction synthétique'});assert.equal(request.status,200);assert.equal(Number(request.body.balance),before);const id=request.body.transactionId;
  assert.equal((await approve(id)).status,409);assert.equal((await confirm(id,await issue(id))).status,200);assert.equal((await approve(id)).status,200);assert.equal(Number((await account(source)).balance),before-7);
});

test('échéance récurrente : file OTP idempotente, jamais de débit automatique',async()=>{
  const before=Number((await account(source)).balance);const id=crypto.randomUUID();await db.prepare("INSERT INTO scheduled_payments(id,account_id,destination_info,amount,label,frequency,next_run) VALUES(?,?,?,?,?,'hebdomadaire',?)").run(id,source,'DE89370400440532013000',3,'Test récurrence',new Date(Date.now()-1000).toISOString());
  await queueDuePayments();await queueDuePayments();const rows=await db.prepare("SELECT * FROM transactions WHERE type='prelevement' AND source_account_id=?").all(source);assert.equal(rows.length,1);assert.equal(rows[0].status,'pending');assert.equal(Number((await account(source)).balance),before);
  assert.equal((await approve(rows[0].id)).status,409);assert.equal((await confirm(rows[0].id,await issue(rows[0].id))).status,200);assert.equal((await approve(rows[0].id)).status,200);assert.equal(Number((await account(source)).balance),before-3);
});

test('plusieurs demandes : solde recontrôlé à l’approbation, pas de découvert ni budget anticipé',async()=>{
  const before=Number((await account(source)).balance);const amount=Math.floor(before*0.75);const payload={source_account_id:source,destination_type:'iban',destination_info:'DE89370400440532013000',amount,libelle:'Test solde final'};
  const first=await req('/transactions/transfer',client.token,'POST',payload);const second=await req('/transactions/transfer',client.token,'POST',payload);assert.equal(first.status,201);assert.equal(second.status,201);
  const budgetBefore=(await req('/budget/'+source,client.token)).body.totalSpent;
  assert.equal((await confirm(first.body.transactionId,await issue(first.body.transactionId))).status,200);assert.equal((await confirm(second.body.transactionId,await issue(second.body.transactionId))).status,200);
  assert.equal((await approve(first.body.transactionId)).status,200);assert.equal((await approve(second.body.transactionId)).status,409);
  assert.equal(Number((await account(source)).balance),before-amount);assert.equal((await db.prepare('SELECT status FROM transactions WHERE id=?').get(second.body.transactionId)).status,'pending');
  assert.equal((await req('/budget/'+source,client.token)).body.totalSpent,budgetBefore+amount);
});

test('ancien débit réservé : annulation rembourse une seule fois',async()=>{
  const before=Number((await account(source)).balance);const id=crypto.randomUUID();await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id=?').run(2,source);
  await db.prepare("INSERT INTO transactions(id,source_account_id,destination_info,amount,type,category,status,libelle) VALUES(?,?,?,-2,'virement_externe','Autre','pending','Historique synthétique')").run(id,source,'FR1420041010050500013M02606');
  assert.equal((await req('/transactions/'+id+'/cancel',client.token,'POST')).status,200);assert.equal(Number((await account(source)).balance),before);assert.equal((await req('/transactions/'+id+'/cancel',client.token,'POST')).status,409);assert.equal(Number((await account(source)).balance),before);
});

