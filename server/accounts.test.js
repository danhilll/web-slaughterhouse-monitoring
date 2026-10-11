import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAccountsRouter, createFirebaseInvitationSender } from './accounts.js';
import { createWebAdminMiddleware, createWriteGuard } from './access.js';

async function fixture(t, options = {}) {
  const state = { users: new Map(), accounts: new Map(), memberships: new Map(), vendors: new Map(), events: [], mail: 0, time: Date.now(), ...options };
  const auth = {
    verifyIdToken: async token => { if (token === 'expired') throw { code: 'auth/id-token-expired' }; return { uid: token }; },
    createUser: async u => { if ([...state.users.values()].some(x => x.email === u.email)) throw { code: 'auth/email-already-exists' }; state.users.set(u.uid, { ...u, customClaims: { preserved: true } }); },
    getUser: async uid => state.users.get(uid),
    getUserByEmail: async email => { const u=[...state.users.values()].find(u=>u.email===email); if(!u)throw {code:'auth/user-not-found'};return u; },
    setCustomUserClaims: async (uid, claims) => { if (state.claimsFail) throw Error('private failure'); state.users.get(uid).customClaims = claims; },
    updateUser: async (uid, patch) => { if (state.disableFail && patch.disabled) throw Error('private failure'); Object.assign(state.users.get(uid), patch); },
    revokeRefreshTokens: async uid => { state.events.push(['revoke', uid]); }
  };
  const store = {
    createVendor: async v => { if([...state.vendors.values()].some(b=>b.stallNumber===v.stallNumber))throw Object.assign(Error('Duplicate stall'),{status:409});state.vendors.set(v.id,v); },
    vendor: async id => ({ id, status: 'Active', municipalScopeId: id === 'OTHER' ? 'SCOPE-B' : 'SCOPE-A' }),
    get: async uid => state.accounts.get(uid),
    list: async (scope, after) => [...state.accounts.values()].filter(a => a.municipalScopeId === scope && (!after || a.uid > after)).sort((a,b) => a.uid.localeCompare(b.uid)).slice(0,26),
    vendors: async () => [{ id: 'VEN-A', name: 'Synthetic vendor' }],
    audit: async () => [],
    prepare: async a => { if([...state.accounts.values()].some(x=>x.email===a.email))throw Object.assign(Error('Already reserved'),{status:409});state.accounts.set(a.uid,{...a}); },
    provision: async a => { state.accounts.set(a.uid, { ...a }); state.memberships.set(a.uid, { status: 'pending' }); },
    recordFailure: async a => state.accounts.set(a.uid, { ...a, status: 'provisioning_failed' }),
    staffPermissions: async(uid, permissions) => { state.accounts.get(uid).staffPermissions=permissions;state.memberships.get(uid).staffPermissions=permissions; },
    reserveInvitation: async (uid, actor, at) => {
      const a = state.accounts.get(uid);
      if (!['active','pending'].includes(a.status)) throw Object.assign(Error('Not ready'), { status:409 });
      if (a.lastInvitationAt && Date.parse(at)-Date.parse(a.lastInvitationAt)<60000) throw Object.assign(Error('Wait'),{status:429});
      a.lastInvitationAt=at;
    },
    update: async (uid, patch, status, actor, action) => { Object.assign(state.accounts.get(uid), patch); if (status) state.memberships.set(uid,{status}); state.events.push([action,uid]); }
  };
  const app = express();
  app.use('/api', createWebAdminMiddleware(() => auth, new Set(['ADMIN'])));
  app.use('/api/accounts', express.json(), createAccountsRouter({ getAuth: () => auth, store, enabled: options.enabled ?? true, scope:'SCOPE-A', adminUids:new Set(['ADMIN']), now: () => new Date(state.time).toISOString(), sendInvitation: async () => {state.mail++; if(state.mailFail) throw Error('mail');} }));
  app.use('/api',createWriteGuard(false));
  app.post('/api/invoices',(req,res)=>res.json({unsafe:true}));
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const call = async (path='', method='GET', body, token='ADMIN') => {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path.startsWith('/invoices') ? path : `/accounts${path}`}`,{method,headers:{...(token ? {Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:response.status, body:await response.json()};
  };
  return {state,call};
}
const form = {fullName:'Synthetic Person',email:'synthetic@example.test',role:'vendor',vendorBusinessId:'VEN-A'};
test('administrator authentication and account gate prevent writes; billing remains paused',async t=>{
  const {call,state}=await fixture(t,{enabled:false});
  assert.equal((await call('','POST',form,null)).status,401);
  assert.equal((await call('','POST',form,'VENDOR')).status,403);
  assert.equal((await call('','POST',form,'expired')).status,401);
  assert.equal((await call('','POST',form)).status,503);
  assert.equal((await call('/invoices','POST',{})).status,503);
  assert.equal(state.users.size,0);
});
test('vendor creation preserves claims and does not expose bootstrap password; duplicate is conflict',async t=>{
  const {call,state}=await fixture(t);
  const r=await call('','POST',form); assert.equal(r.status,201);
  assert.equal(r.body.account.status,'active'); assert.equal(r.body.account.invitationStatus,'sent');
  assert.equal(Object.hasOwn(r.body.account,'password'),false);
  const u=state.users.get(r.body.account.uid); assert.equal(u.disabled,false); assert.equal(u.customClaims.preserved,true);
  assert.equal(JSON.stringify(r.body).includes(u.password),false);
  assert.equal(u.customClaims.municipalRole,'vendor'); assert.equal(u.customClaims.municipalScopeId,'SCOPE-A');
  assert.equal(state.memberships.get(u.uid).status,'active');
  assert.equal((await call('','POST',form)).status,409); assert.equal(state.users.size,1);
});
test('unknown fields, admin roles and cross-scope business links are rejected before Auth creation',async t=>{
  const {call,state}=await fixture(t);
  for(const bad of [{...form,municipalScopeId:'SCOPE-B'},{...form,role:'admin'},{...form,password:'secret'},{...form,vendorBusinessId:'OTHER'},{...form,role:'staff'},{...form,email:'invalid'}]) assert.ok([400,409].includes((await call('','POST',bad)).status));
  assert.equal(state.users.size,0);
});
test('staff and inspector memberships stay pending',async t=>{
  const {call,state}=await fixture(t);
  for(const role of ['staff','inspector']) {
    const r=await call('','POST',{fullName:'Synthetic',email:`${role}@example.test`,role});
    assert.equal(r.status,201); assert.equal(r.body.account.status,'pending'); assert.equal(state.memberships.get(r.body.account.uid).status,'pending');
  }
});
test('claim failure leaves account disabled and membership closed with visible failure',async t=>{
  const {call,state}=await fixture(t,{claimsFail:true}); assert.equal((await call('','POST',form)).status,503);
  assert.equal([...state.users.values()][0].disabled,true); assert.equal([...state.accounts.values()][0].status,'provisioning_failed'); assert.equal([...state.memberships.values()][0].status,'pending');
});
test('invitation failure preserves one account; retry is throttled then succeeds',async t=>{
  const {call,state}=await fixture(t,{mailFail:true}); const r=await call('','POST',form); assert.equal(r.status,201); assert.equal(r.body.account.invitationStatus,'failed');
  const uid=r.body.account.uid; assert.equal((await call(`/${uid}/invitation`,'POST',{})).status,429);
  state.time+=61000;state.mailFail=false;
  assert.equal((await call(`/${uid}/invitation`,'POST',{})).body.invitationStatus,'sent'); assert.equal(state.users.size,1);
});
test('deactivation closes membership first even if Firebase cleanup fails',async t=>{
  const {call,state}=await fixture(t);const r=await call('','POST',form); const uid=r.body.account.uid;
  state.disableFail=true; assert.equal((await call(`/${uid}/deactivate`,'POST',{})).status,503);
  assert.equal(state.memberships.get(uid).status,'inactive'); assert.equal((await call(`/${uid}/invitation`,'POST',{})).status,409);
  state.disableFail=false;assert.equal((await call(`/${uid}/deactivate`,'POST',{})).status,200);assert.equal(state.users.get(uid).disabled,true);
});
test('cross-scope and administrator targets cannot be deactivated; directory strips private fields',async t=>{
  const {call,state}=await fixture(t);
  state.accounts.set('ADMIN',{uid:'ADMIN',municipalScopeId:'SCOPE-A'});
  state.accounts.set('OTHER',{uid:'OTHER',municipalScopeId:'SCOPE-B'});
  state.accounts.set('VISIBLE',{uid:'VISIBLE',municipalScopeId:'SCOPE-A',privateSecret:'hidden'});
  assert.equal((await call('/ADMIN/deactivate','POST',{})).status,409); assert.equal((await call('/OTHER/deactivate','POST',{})).status,404);
  assert.equal(JSON.stringify((await call()).body).includes('privateSecret'),false);
  assert.equal((await call('?after=../unsafe')).status,400);assert.equal((await call('','DELETE',{})).status,405);
});
test('Firebase invitation sender uses reset-email requests and does not leak links',async()=>{
  let sent;const send=createFirebaseInvitationSender({apiKey:'demo',emulatorHost:'127.0.0.1:9199',fetchImpl:async(url,init)=>{sent={url,body:JSON.parse(init.body)};return {ok:true};}});
  assert.equal(await send('synthetic@example.test'),undefined); assert.equal(sent.body.requestType,'PASSWORD_RESET');assert.match(sent.url,/^http:\/\/127\.0\.0\.1:9199/);
  await assert.rejects(createFirebaseInvitationSender({apiKey:'demo',emulatorHost:'remote:9199'})('x@example.test'));
});
test('business registration derives identity and scope; invalid contact and injected fields are rejected',async t=>{
  const {call,state}=await fixture(t);
  const b={name:'Synthetic stall',address:'Synthetic address',contact_number:'09123456789',email:'business@example.test',animal_type:'Pig',marketName:'Synthetic Market',marketSection:'Meat',stallNumber:'1'};
  const r=await call('/vendors','POST',b);assert.equal(r.status,201);assert.match(r.body.vendor.id,/^VEN-/);assert.equal(r.body.vendor.municipalScopeId,'SCOPE-A');assert.match(r.body.vendor.created_at,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await call('/vendors','POST',b)).status,409);
  assert.equal((await call('/vendors','POST',{...b,municipalScopeId:'OTHER'})).status,400);
  assert.equal((await call('/vendors','POST',{...b,contact_number:'bad'})).status,400);assert.equal(state.vendors.size,1);
});
test('optional personal contact is stored as contact information and validated',async t=>{
  const {call}=await fixture(t);
  assert.equal((await call('','POST',{...form,contactNumber:'not-a-number'})).status,400);
  const r=await call('','POST',{...form,contactNumber:'09123456789'});assert.equal(r.status,201);assert.equal(r.body.account.contactNumber,'09123456789');
});
test('staff functions are explicit, restricted to staff, and reassignment preserves pending access',async t=>{
  const {call,state}=await fixture(t);
  assert.equal((await call('','POST',{...form,staffPermissions:['inventory']})).status,400);
  assert.equal((await call('','POST',{fullName:'Synthetic Staff',email:'staff@example.test',role:'staff',staffPermissions:['admin']})).status,400);
  const r=await call('','POST',{fullName:'Synthetic Staff',email:'staff@example.test',role:'staff',staffPermissions:['inventory']});assert.equal(r.status,201);assert.deepEqual(r.body.account.staffPermissions,['inventory']);
  const uid=r.body.account.uid;assert.equal((await call(`/${uid}/permissions`,'POST',{staffPermissions:['billing','delivery']})).status,200);assert.equal(state.memberships.get(uid).status,'pending');assert.deepEqual(state.memberships.get(uid).staffPermissions,['billing','delivery']);
  assert.equal((await call(`/${uid}/permissions`,'POST',{staffPermissions:['admin']})).status,400);
});
