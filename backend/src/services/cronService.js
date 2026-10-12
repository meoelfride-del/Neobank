const cron=require('node-cron');const db=require('../config/database');const {categorize}=require('./budgetService');const {v4:uuid}=require('uuid');
async function queueDuePayments(io){
  const due=await db.prepare('SELECT id FROM scheduled_payments WHERE active=TRUE AND next_run<=?').all(new Date().toISOString());
  for(const item of due){
    const queued=await db.transaction(async()=>{
      const payment=await db.prepare('SELECT * FROM scheduled_payments WHERE id=? FOR UPDATE').get(item.id);
      if(!payment?.active||new Date(payment.next_run).getTime()>Date.now())return null;
      const account=await db.prepare('SELECT a.*,u.status_kyc,u.status_compte FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.id=?').get(payment.account_id);
      if(!account?.iban||account.status_kyc!=='verified'||account.status_compte!=='active')return null;
      const key='schedule:'+payment.id+':'+new Date(payment.next_run).toISOString();
      const existing=await db.prepare('SELECT id FROM transactions WHERE source_account_id=? AND idempotency_key=?').get(account.id,key);
      const id=existing?.id||uuid();
      const destination=await db.prepare('SELECT * FROM accounts WHERE iban=?').get(payment.destination_info)
        || await db.prepare("SELECT a.* FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.phone=? AND a.type='Courant'").get(payment.destination_info);
      if(!existing)await db.prepare(`INSERT INTO transactions(id,source_account_id,destination_info,amount,type,category,status,libelle,idempotency_key,debit_applied,destination_account_id)
        VALUES(?,?,?,?,'prelevement',?,'pending',?,?,FALSE,?)`).run(id,account.id,payment.destination_info,-payment.amount,categorize(payment.label),payment.label,key,destination?.id || null);
      const next=new Date(payment.next_run);next.setDate(next.getDate()+(payment.frequency==='hebdomadaire'?7:30));
      await db.prepare('UPDATE scheduled_payments SET next_run=? WHERE id=?').run(next.toISOString(),payment.id);
      return {id,userId:account.user_id,amount:payment.amount};
    })();
    if(queued&&io){io.to('role:admin').emit('transaction:otp-required',{transactionId:queued.id});io.to('user:'+queued.userId).emit('transaction:notification',{direction:'outgoing',status:'pending',amount:queued.amount,message:'Échéance en attente d’un OTP administrateur et de votre confirmation.'});}
  }
}
function startCronJobs(io){return cron.schedule('0 * * * *',()=>queueDuePayments(io).catch(()=>console.error('[cron] Contrôle des échéances impossible.')));}
module.exports={startCronJobs,queueDuePayments};
