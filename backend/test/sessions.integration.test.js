const {before,after,test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const jwt=require('jsonwebtoken');const bcrypt=require('bcryptjs');const {Server}=require('socket.io');const {io}=require('socket.io-client');
process.env.NODE_ENV='test';process.env.DATABASE_URL='pg-mem://';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.JWT_REFRESH_SECRET=crypto.randomBytes(32).toString('hex');process.env.ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');
const db=require('../src/config/database');const app=require('../src/app');const initSockets=require('../src/sockets');let server,sockets,base,origin;
async function request(path,token,method='GET',body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:response.status===204?null:await response.json()};}
async function login(email='session@example.test'){const result=await request('/auth/login',null,'POST',{email,password:'Synthetic123!'});assert.equal(result.status,200);return result.body;}
async function connect(token){return new Promise((resolve,reject)=>{const client=io(origin,{auth:{token},transports:['websocket'],reconnection:false});client.once('connect',()=>resolve(client));client.once('connect_error',error=>{client.close();reject(error);});});}
before(async()=>{await db.initDatabase();for(const email of ['session@example.test','other@example.test'])await db.prepare('INSERT INTO users(id,nom,prenom,email,password_hash,status_kyc) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),'Test','Session',email,await bcrypt.hash('Synthetic123!',4),'verified');server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));origin='http://127.0.0.1:'+server.address().port;base=origin+'/api';sockets=new Server(server);initSockets(sockets);app.set('io',sockets);});
after(async()=>{await new Promise(resolve=>sockets.close(resolve));await db.close();});
test('liste privée sans jetons et révocation réservée au propriétaire',async()=>{const one=await login(),two=await login(),other=await login('other@example.test');const list=await request('/auth/sessions',one.accessToken);assert.equal(list.status,200);assert.equal(list.body.sessions.length,2);assert.equal(list.body.sessions.filter(s=>s.current).length,1);assert.ok(!JSON.stringify(list.body).includes('token_hash'));const sid=jwt.decode(two.accessToken).sid;assert.equal((await request('/auth/sessions/'+sid,other.accessToken,'DELETE')).status,404);assert.equal((await request('/auth/sessions/'+sid,one.accessToken,'DELETE')).status,204);assert.equal((await request('/accounts',two.accessToken)).status,401);assert.equal((await request('/accounts',one.accessToken)).status,200);});
test('logout bloque accès et refresh, ferme le socket et préserve une autre session',async()=>{const one=await login(),two=await login();const socket=await connect(one.accessToken);try{const disconnected=new Promise(resolve=>socket.once('disconnect',resolve));assert.equal((await request('/auth/logout',null,'POST',{refreshToken:one.refreshToken})).status,204);await disconnected;assert.equal(socket.connected,false);assert.equal((await request('/accounts',one.accessToken)).status,401);assert.equal((await request('/auth/refresh',null,'POST',{refreshToken:one.refreshToken})).status,401);assert.equal((await request('/accounts',two.accessToken)).status,200);await assert.rejects(connect(one.accessToken));}finally{socket.close();}});
test('rotation invalide ancien accès et socket puis accepte la nouvelle paire',async()=>{const one=await login();const socket=await connect(one.accessToken);try{const disconnected=new Promise(resolve=>socket.once('disconnect',resolve));const rotated=await request('/auth/refresh',null,'POST',{refreshToken:one.refreshToken});assert.equal(rotated.status,200);await disconnected;assert.equal((await request('/accounts',one.accessToken)).status,401);assert.equal((await request('/accounts',rotated.body.accessToken)).status,200);assert.equal((await request('/auth/refresh',null,'POST',{refreshToken:one.refreshToken})).status,401);}finally{socket.close();}});
test('JWT sans session, mauvais type et expiration refusés en HTTP et socket',async()=>{const one=await login();const payload=jwt.decode(one.accessToken);for(const token of [jwt.sign({sub:payload.sub,type:'access'},process.env.JWT_SECRET),jwt.sign({sub:payload.sub,type:'refresh',sid:payload.sid},process.env.JWT_SECRET),jwt.sign({sub:payload.sub,type:'access',sid:payload.sid},process.env.JWT_SECRET,{expiresIn:-1})]){assert.equal((await request('/accounts',token)).status,401);await assert.rejects(connect(token));}});


test('logout d’un ancien refresh révoque aussi sa version renouvelée',async()=>{
  const one=await login();const rotated=await request('/auth/refresh',null,'POST',{refreshToken:one.refreshToken});assert.equal(rotated.status,200);
  assert.equal((await request('/auth/logout',null,'POST',{refreshToken:one.refreshToken})).status,204);
  assert.equal((await request('/accounts',rotated.body.accessToken)).status,401);
  assert.equal((await request('/auth/refresh',null,'POST',{refreshToken:rotated.body.refreshToken})).status,401);
});

test('suspension ferme immédiatement le socket et bloque les requêtes', async () => {
  const adminId = crypto.randomUUID();
  await db.prepare("INSERT INTO users(id,nom,prenom,email,password_hash,role,status_kyc) VALUES(?,?,?,?,?,'admin','verified')")
    .run(adminId, 'Test', 'Admin', 'suspension-admin@example.test', await bcrypt.hash('Synthetic123!', 4));
  const admin = await login('suspension-admin@example.test');
  const user = await login('other@example.test');
  const client = await connect(user.accessToken);
  const userId = jwt.decode(user.accessToken).sub;
  try {
    const disconnected = new Promise(resolve => client.once('disconnect', resolve));
    assert.equal((await request('/admin/users/' + userId + '/suspend', admin.accessToken, 'POST', { suspended: true })).status, 200);
    await disconnected;
    assert.equal(client.connected, false);
    assert.equal((await request('/accounts', user.accessToken)).status, 403);
    await assert.rejects(connect(user.accessToken));
  } finally { client.close(); }
});
