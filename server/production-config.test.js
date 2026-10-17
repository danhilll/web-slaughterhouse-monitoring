import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProductionConfig, assertProductionProject } from './production-config.js';
import { createAnimalRouter } from './animals.js';
import { createOperationsRouter } from './operations.js';
import { createMobileRouter } from './mobile.js';

const fixture = () => ({
  env:{NODE_ENV:'production',PRODUCTION_RELEASE_MANIFEST:'/synthetic/release.json',FIREBASE_PROJECT_ID:'municipal-fixture',VITE_FIREBASE_PROJECT_ID:'municipal-fixture',MUNICIPAL_SCOPE_ID:'SCOPE',CURSOR_SIGNING_SECRET:'test-only-fixed-cursor-key-not-a-real-secret'},
  manifest:{version:1,mode:'production',projectId:'municipal-fixture',municipalScopeId:'SCOPE',apiOrigin:'https://api.example.test',features:{}}
});
const load = ({env,manifest}) => loadProductionConfig(env,()=>manifest);
test('proposed first workflow enables only its four independent gates and rollback preserves cursor identity',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../deployment/first-workflow.proposed.json',import.meta.url),'utf8'));
  const rollback=JSON.parse(readFileSync(new URL('../deployment/production-release.json',import.meta.url),'utf8'));
  const f=fixture();
  f.env={...f.env,FIREBASE_PROJECT_ID:manifest.projectId,VITE_FIREBASE_PROJECT_ID:manifest.projectId,
    MUNICIPAL_SCOPE_ID:manifest.municipalScopeId,VITE_FIREBASE_API_KEY:'test-public-key',
    ACCOUNT_MANAGEMENT_ENABLED:'false',ANIMAL_WORKFLOW_ENABLED:'false',ANIMAL_OPERATIONS_ENABLED:'false'};
  const active=load({...f,manifest}),paused=load({...f,manifest:rollback});
  assert.deepEqual(Object.entries(active.features).filter(([,v])=>v).map(([k])=>k),['accountManagement','activation','animals','inspection']);
  assert.ok(Object.values(paused.features).every(v=>v===false));
  for(const domain of ['animals','mobile','web-lists'])assert.deepEqual(active.cursorSecret(domain),paused.cursorSecret(domain));
});
test('production features default off, remain independent, and ignore legacy rehearsal write flags',()=>{
  const f=fixture();f.env.ACCOUNT_MANAGEMENT_ENABLED='true';f.env.ANIMAL_WORKFLOW_ENABLED='true';f.env.ANIMAL_OPERATIONS_ENABLED='true';
  const config=load(f);assert.ok(Object.values(config.features).every(v=>v===false));
  for(const key of ['accountManagement','activation','animals','inspection']){
    f.env.VITE_FIREBASE_API_KEY='test-public-key';f.manifest.features={[key]:true};
    const c=load(f);assert.deepEqual(Object.entries(c.features).filter(([,v])=>v).map(([k])=>k),[key]);
  }
});
test('production refuses absent or malformed manifests and cannot fall back to rehearsal on a real project',()=>{
  assert.equal(loadProductionConfig({FIREBASE_PROJECT_ID:'demo-fixture'}),null);
  assert.throws(()=>loadProductionConfig({FIREBASE_PROJECT_ID:'municipal-fixture'}),/PRODUCTION_RELEASE_MANIFEST/);
  assert.throws(()=>loadProductionConfig({NODE_ENV:'production'}),/PRODUCTION_RELEASE_MANIFEST/);
  const f=fixture();assert.throws(()=>loadProductionConfig(f.env,()=>{throw Error('private path');}),/manifest cannot be read/);
  for(const manifest of [null,[],{...f.manifest,version:2},{...f.manifest,mode:'rehearsal'}])assert.throws(()=>load({...f,manifest}),/Production configuration/);
});
test('exact projects, municipality, HTTPS origin and emulator exclusion fail closed',()=>{
  const f=fixture();
  for(const key of ['FIREBASE_PROJECT_ID','VITE_FIREBASE_PROJECT_ID','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','MUNICIPAL_SCOPE_ID'])assert.throws(()=>load({...f,env:{...f.env,[key]:'OTHER'}}),/must match/);
  for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])assert.throws(()=>load({...f,env:{...f.env,[key]:'127.0.0.1:8180'}}),/emulator hosts/);
  for(const apiOrigin of ['', '<approved HTTPS origin>','http://api.example.test','https://localhost','https://127.0.0.1','https://api.example.test/path','https://api.example.test/','https://user:pass@api.example.test'])assert.throws(()=>load({...f,manifest:{...f.manifest,apiOrigin}}),/HTTPS/);
  assert.throws(()=>load({...f,env:{...f.env,CORS_ORIGIN:'https://unapproved.example.test'}}),/CORS_ORIGIN/);
  assert.throws(()=>load({...f,manifest:{...f.manifest,projectId:'demo-fixture'}}),/real project/);
  assertProductionProject(load(f),'municipal-fixture');assert.throws(()=>assertProductionProject(load(f),'OTHER'),/connected Firestore project/);
});
test('unresolved policies cannot enable carcass or financial/delivery recording',()=>{
  const f=fixture();
  for(const key of ['carcass','billing','payment','delivery','tracking'])assert.throws(()=>load({...f,manifest:{...f.manifest,features:{[key]:true},policies:{fees:'approved',carcassDefinition:'approved',numbering:'approved',reversals:'approved'}}}),/keep these gates off/);
  for(const features of [{animals:'true'},{animals:1},{typo:true},[],null])assert.throws(()=>load({...f,manifest:{...f.manifest,features}}),/feature/);
  assert.throws(()=>load({...f,manifest:{...f.manifest,features:{accountManagement:true}}}),/invitation API key/);
});
test('cursor signing requires a stable secret and domain separates routers across instances',()=>{
  const f=fixture();
  for(const secret of [undefined,'','short',' '.repeat(32),'placeholder-that-is-more-than-thirty-two-bytes'])assert.throws(()=>load({...f,env:{...f.env,CURSOR_SIGNING_SECRET:secret}}),/CURSOR_SIGNING_SECRET/);
  const a=load(f),b=load(f);assert.deepEqual(a.cursorSecret('animals'),b.cursorSecret('animals'));assert.notDeepEqual(a.cursorSecret('animals'),a.cursorSecret('operations'));assert.notDeepEqual(a.cursorSecret('animals'),a.cursorSecret('mobile'));
  for(const create of [createAnimalRouter,createOperationsRouter,createMobileRouter])assert.throws(()=>create({production:a}),/Stable production cursor/);
});
