import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRehearsalContext } from './context.mjs';

// Add uniquely named synthetic records; never reset another running walkthrough.
const context = await createRehearsalContext();
const [
  { createAccountsRouter, createAccountStore, createFirebaseInvitationSender },
  { createWebAdminMiddleware, createWriteGuard },
  { createMobileRouter, createMobileFirestoreStore }
] = await Promise.all([import('../server/accounts.js'), import('../server/access.js'), import('../server/mobile.js')]);
const { default: express } = await import('express');
const { deleteApp } = await import('firebase-admin/app');
const suffix = randomUUID();
const adminUid = `ACCOUNT-ADMIN-${suffix}`;
let businessId;
const marketName = `Synthetic Market ${suffix}`;
const password = 'Synthetic-account-test-42!';
const createdUids = [adminUid];
let server;
let checks = 0;
const check = (label) => { checks++; console.log(`PASS ${label}`); };
const authRequest = async (method, data) => {
  const r = await fetch(`http://${context.hosts.auth.address}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=synthetic`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data) });
  const body = await r.json(); return {status:r.status,body};
};
try {
  await context.auth.createUser({uid:adminUid,email:`admin-${suffix}@rehearsal.example.test`,password});
  const app=express();
  app.use('/api/mobile',createMobileRouter({getAuth:()=>context.auth,store:createMobileFirestoreStore(()=>context.db)}));
  app.use('/api',createWebAdminMiddleware(()=>context.auth,new Set([adminUid])));
  app.use('/api/accounts',express.json({limit:'16kb'}),createAccountsRouter({getAuth:()=>context.auth,store:createAccountStore(()=>context.db),enabled:true,scope:'ACCOUNT-SCOPE',adminUids:new Set([adminUid]),sendInvitation:createFirebaseInvitationSender({apiKey:'synthetic',emulatorHost:context.hosts.auth.address})}));
  app.use('/api',createWriteGuard(false)); app.post('/api/invoices',(req,res)=>res.json({unsafe:true}));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const adminLogin=await authRequest('signInWithPassword',{email:`admin-${suffix}@rehearsal.example.test`,password,returnSecureToken:true});
  assert.equal(adminLogin.status,200);
  const call=async(path,token=adminLogin.body.idToken,method='GET',data)=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})});
    return {status:r.status,body:await r.json()};
  };
  const email=`vendor-${suffix}@rehearsal.example.test`;
  const businessForm={name:'Synthetic account test vendor',address:'Synthetic',contact_number:'09123456789',email:'business@rehearsal.example.test',animal_type:'Pig',marketName,marketSection:'Meat Section',stallNumber:'001'};
  assert.equal((await call('/api/accounts/vendors',null,'POST',businessForm)).status,401);
  const registration=await call('/api/accounts/vendors',undefined,'POST',businessForm);assert.equal(registration.status,201);
  businessId=registration.body.vendor.id;assert.equal(registration.body.vendor.municipalScopeId,'ACCOUNT-SCOPE');check('municipal business registration assigns a stable ID and confirmed stall');
  assert.equal((await call('/api/accounts/vendors',undefined,'POST',{...businessForm,marketSection:'  MEAT   section '})).status,409);check('duplicate normalized stall assignment is rejected');
  const form={fullName:'Synthetic Pilot',email,contactNumber:'09123456789',role:'vendor',vendorBusinessId:businessId};
  assert.equal((await call('/api/accounts',null,'POST',form)).status,401);check('anonymous account creation denied');
  const created=await call('/api/accounts',undefined,'POST',form);assert.equal(created.status,201);assert.equal(created.body.account.invitationStatus,'sent');
  const uid=created.body.account.uid;createdUids.push(uid);check('real emulator Auth and protected documents created');
  assert.equal((await call('/api/accounts',undefined,'POST',form)).status,409);check('duplicate email preserves original UID');
  const membership=(await context.db.doc(`mobile_memberships/${uid}`).get()).data();assert.equal(membership.status,'active');assert.equal(membership.vendorBusinessId,businessId);check('membership and canonical ownership agree');
  const oob=await fetch(`http://${context.hosts.auth.address}/emulator/v1/projects/${context.hosts.projectId}/oobCodes`);
  const codes=(await oob.json()).oobCodes;const invitation=codes.find(c=>c.email===email && c.requestType==='PASSWORD_RESET');assert.ok(invitation?.oobCode);check('local Firebase password setup invitation generated');
  assert.equal((await authRequest('resetPassword',{oobCode:invitation.oobCode,newPassword:password})).status,200);check('user sets their own password');
  const login=await authRequest('signInWithPassword',{email,password,returnSecureToken:true});assert.equal(login.status,200);
  const me=await call('/api/mobile/me',login.body.idToken);assert.equal(me.status,200);assert.equal(me.body.vendorBusinessId,businessId);check('new vendor signs in to mobile API with matching claims');
  assert.equal((await call('/api/accounts',login.body.idToken)).status,403);check('new vendor cannot use administrator endpoints');
  assert.deepEqual((await call('/api/mobile/invoices',login.body.idToken)).body.items,[]);check('new vendor sees honest empty history');
  const staff=await call('/api/accounts',undefined,'POST',{fullName:'Synthetic Staff',email:`staff-${suffix}@rehearsal.example.test`,role:'staff',staffPermissions:['inventory']});assert.equal(staff.status,201);createdUids.push(staff.body.account.uid);
  assert.equal((await context.db.doc(`mobile_memberships/${staff.body.account.uid}`).get()).data().status,'pending');check('staff access remains pending');
  assert.deepEqual((await context.db.doc(`mobile_memberships/${staff.body.account.uid}`).get()).data().staffPermissions,['inventory']);check('assigned staff functions persist in protected membership');
  assert.equal((await call(`/api/accounts/${staff.body.account.uid}/permissions`,undefined,'POST',{staffPermissions:['billing','delivery']})).status,200);
  const changedStaff=(await context.db.doc(`mobile_memberships/${staff.body.account.uid}`).get()).data();
  assert.equal(changedStaff.status,'pending');assert.deepEqual(changedStaff.staffPermissions,['billing','delivery']);
  assert.deepEqual((await context.db.doc(`managed_accounts/${staff.body.account.uid}`).get()).data().staffPermissions,['billing','delivery']);check('staff reassignment updates both protected documents without activation');
  assert.equal((await call('/api/accounts/vendors')).body.items.length,1);assert.ok((await call(`/api/accounts/${uid}/audit`)).body.items.length>=3);check('bounded business selection and audit history work');
  assert.equal((await call('/api/invoices',undefined,'POST',{})).status,503);check('official billing writes remain paused');
  assert.equal((await call(`/api/accounts/${uid}/deactivate`,undefined,'POST',{})).status,200);
  assert.ok([401,403].includes((await call('/api/mobile/me',login.body.idToken)).status));assert.equal((await context.auth.getUser(uid)).disabled,true);check('deactivation denies existing session and disables Auth');
  const storage=createAccountStore(()=>context.db);
  await assert.rejects(storage.update(uid,{status:'active'},'active',adminUid,'provisioned'));
  await storage.recordFailure({...created.body.account,status:'provisioning'});
  assert.equal((await storage.get(uid)).status,'inactive');check('late setup completion cannot reactivate a deactivated account');
  console.log(`ACCOUNT REHEARSAL PASSED: ${checks} checks. Emulator setup emails are not delivered to a real inbox.`);
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const uid of createdUids){
    await context.auth.deleteUser(uid).catch(()=>{});
    const audit=await context.db.collection('account_audit').where('targetUid','==',uid).get();
    const batch=context.db.batch();for(const d of audit.docs)batch.delete(d.ref);
    for(const collection of ['Users','managed_accounts','mobile_memberships'])batch.delete(context.db.doc(`${collection}/${uid}`));
    const record=await context.db.doc(`managed_accounts/${uid}`).get();
    if(record.exists)batch.delete(context.db.doc(`account_email_reservations/${createHash('sha256').update(record.data().email).digest('hex')}`));
    await batch.commit();
  }
  if(businessId){
    const assignments=await context.db.collection('market_stall_assignments').where('vendorBusinessId','==',businessId).get();
    const events=await context.db.collection('vendor_audit').where('vendorBusinessId','==',businessId).get();
    const batch=context.db.batch();for(const d of [...assignments.docs,...events.docs])batch.delete(d.ref);batch.delete(context.db.doc(`vendors/${businessId}`));await batch.commit();
  }
  await context.db.terminate();await deleteApp(context.app);
}
