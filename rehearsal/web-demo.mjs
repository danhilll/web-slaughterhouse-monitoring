// Standalone synthetic administrator UI; never reads the real .env.
import { createRehearsalContext } from './context.mjs';
const context = await createRehearsalContext();
if(context.hosts.auth.address!=='127.0.0.1:9199'||context.hosts.firestore.address!=='127.0.0.1:8180')throw Error('Use the documented rehearsal ports.');
const [{default:express},{createServer},{default:react},{createWebAdminMiddleware},{createOperationsStore,createOperationsRouter},{createAnimalStore}]=await Promise.all([
  import('express'),import('vite'),import('@vitejs/plugin-react'),import('../server/access.js'),import('../server/operations.js'),import('../server/animals.js')
]);
const uid='ALL-ROLE-DEMO-WEB-ADMIN',email='web-admin@rehearsal.example.test';
try{await context.auth.createUser({uid,email,password:'Synthetic-only-42!',emailVerified:true});}
catch(e){if(e.code!=='auth/uid-already-exists')throw e;const user=await context.auth.getUser(uid);if(user.email!==email||user.disabled)throw Error('Reserved demo administrator requires review.');}
const app=express();
app.get('/rehearsal/health',(req,res)=>res.json({projectId:context.hosts.projectId,syntheticOnly:true}));
app.use('/api',createWebAdminMiddleware(()=>context.auth,new Set([uid])));
app.use('/api/operations',createOperationsRouter({store:createOperationsStore(()=>context.db),animalStore:createAnimalStore(()=>context.db),enabled:true,getPrincipal:req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:'SCOPE-A',staffPermissions:[]})}));
app.use('/api',(req,res)=>res.status(404).json({message:'This demo panel exposes only administrator workflow history.'}));
const server=app.listen(5004,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
const values={VITE_FIREBASE_API_KEY:'synthetic',VITE_FIREBASE_PROJECT_ID:'demo-mobile-rehearsal',VITE_FIREBASE_AUTH_DOMAIN:'demo-mobile-rehearsal.firebaseapp.com',VITE_FIREBASE_APP_ID:'synthetic-web-demo',VITE_FIREBASE_STORAGE_BUCKET:'',VITE_FIREBASE_MESSAGING_SENDER_ID:''};
const vite=await createServer({configFile:false,envFile:false,plugins:[react()],define:Object.fromEntries(Object.entries(values).map(([k,v])=>[`import.meta.env.${k}`,JSON.stringify(v)])),server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:5004',changeOrigin:true}}}});
await vite.listen();console.log('Synthetic administrator history: http://127.0.0.1:5174/rehearsal/web-demo.html');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await vite.close();server.close();await context.db.terminate();process.exit(0);});
