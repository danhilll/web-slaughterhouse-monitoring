// Read-only check of EXISTING demo records; never seeds, resets or changes memberships.
import assert from 'node:assert/strict';
import {assertEmulators,enforceLoopbackOnly} from './safety.mjs';
const hosts=assertEmulators();
assert.equal(hosts.auth.port,9199);assert.equal(hosts.firestore.port,8180);
enforceLoopbackOnly();
async function signIn(email){
  const response=await fetch(`http://${hosts.auth.address}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Synthetic-only-42!',returnSecureToken:true}),signal:AbortSignal.timeout(8000),
  });
  assert.equal(response.status,200,`Existing synthetic account unavailable: ${email}`);
  return (await response.json()).idToken;
}
async function read(token,path){
  const response=await fetch(`http://127.0.0.1:5003/api/mobile/operations${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
  return {status:response.status,body:await response.json()};
}
const vendor=await signIn('identity-vendor@rehearsal.example.test');
const other=await signIn('bob@rehearsal.example.test');
let selected,cursor;
for(let page=0;page<20&&!selected;page++){
  const result=await read(vendor,`/invoices${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);
  assert.equal(result.status,200);selected=result.body.items.find(item=>item.delivery);
  cursor=result.body.nextCursor;if(!cursor)break;
}
if(!selected)throw new Error('No existing assigned delivery found for the identity vendor in the first 20 pages. No fixtures were created.');
const path=`/invoices/${encodeURIComponent(selected.id)}/tracking`;
const own=await read(vendor,path);assert.equal(own.status,200);assert.equal(own.body.invoiceId,selected.id);
const denied=await read(other,path);assert.equal(denied.status,404);assert.equal(denied.body.location,undefined);
console.log(`PASS existing vendor delivery view; other vendor denied. State: ${own.body.trackingState}. Position available: ${!!own.body.location}. No business records changed.`);
