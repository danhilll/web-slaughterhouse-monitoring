// Bounded isolated synthetic fixture: real candidate routers + in-memory Firestore, never Firebase/network credentials.
import {writeFile,access,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture} from '../server/test-support/operations-fixture.js';
const ready=process.argv[2];
if(!ready?.startsWith('/private/tmp/'))throw Error('A fresh private /private/tmp ready-file path is required');
try{await access(ready);throw Error('Ready file exists; refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
let cleanup;const f=await fixture({after:fn=>{cleanup=fn;}});
f.rows.delete('animal_organ_choices/ANM-A');
const baseline=structuredClone([...f.rows]);f.app.post('/__fixture/reset',(req,res)=>{if(req.headers['x-synthetic-fixture']!=='destination_v10')return res.sendStatus(403);f.rows.clear();for(const[k,v]of structuredClone(baseline))f.rows.set(k,v);res.json({syntheticOnly:true,reset:true});});
const serverSourceSha256={};for(const name of ['server/operations.js','server/destination-map.js','server/drop-off-point.js','server/animals.js','server/tracking.js','server/owner-workflow-policy.js','server/operation-workspaces.js','server/test-support/operations-fixture.js'])serverSourceSha256[name]=createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex');
await writeFile(ready,JSON.stringify({url:f.origin,animalId:'ANM-A',municipalScopeId:'SCOPE',vendorBusinessId:'VEN-A',syntheticOnly:true,serverSourceSha256,roleTokens:{billing:'billing',inspector:'inspector',vendor:'alice',otherVendor:'bob',delivery:'delivery',otherDelivery:'delivery2',inventory:'inventory'},adminOversightPath:'/api/operations/oversight/invoices/',adminTokenRequired:false,resetUrl:f.origin+'/__fixture/reset',resetHeader:{'X-Synthetic-Fixture':'destination_v10'}},null,2)+'\n',{flag:'wx',mode:0o600});
console.log('ISOLATED_SYNTHETIC_WORKFLOW_READY; metadata in approved private ready file');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await cleanup?.();process.exit(0);});
