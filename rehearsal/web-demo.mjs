// Standalone synthetic administrator UI; never reads the real .env.
import { prepareWebDemo } from './web-demo-startup.mjs';
const { context, carcassWeightEnabled, uid } = await prepareWebDemo();
const [{default:express},{createServer},{default:react},{createWebAdminMiddleware},{createOperationsStore,createOperationsRouter},{createAnimalStore}]=await Promise.all([
  import('express'),import('vite'),import('@vitejs/plugin-react'),import('../server/access.js'),import('../server/operations.js'),import('../server/animals.js')
]);
const {createAnimalRouter,createAnimalMobileAuth}=await import('../server/animals.js');
const {createAccountStore,createAccountsRouter,createFirebaseInvitationSender}=await import('../server/accounts.js');
const app=express();
app.get('/rehearsal/health',(req,res)=>res.json({projectId:context.hosts.projectId,syntheticOnly:true}));
app.use(express.json({limit:'16kb'}));
const animalStore=createAnimalStore(()=>context.db);
app.use('/api/mobile/animals',createAnimalMobileAuth(()=>context.auth,animalStore),createAnimalRouter({store:animalStore,enabled:true,carcassWeightEnabled,getPrincipal:req=>req.animalUser}));
app.use('/api',createWebAdminMiddleware(()=>context.auth,new Set([uid])));
const principal=req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:'SCOPE-A',staffPermissions:[]});
app.use('/api/accounts',createAccountsRouter({getAuth:()=>context.auth,store:createAccountStore(()=>context.db),enabled:true,activationEnabled:true,scope:'SCOPE-A',municipalityName:'Synthetic rehearsal',adminUids:new Set([uid]),sendInvitation:createFirebaseInvitationSender({apiKey:'synthetic',emulatorHost:context.hosts.auth.address})}));
app.use('/api/animals',createAnimalRouter({store:createAnimalStore(()=>context.db),enabled:true,operationsEnabled:true,carcassWeightEnabled,getPrincipal:principal}));
app.use('/api/operations',createOperationsRouter({store:createOperationsStore(()=>context.db),animalStore:createAnimalStore(()=>context.db),enabled:true,getPrincipal:req=>({uid:req.webUser.uid,role:'admin',municipalScopeId:'SCOPE-A',staffPermissions:[]})}));
app.use('/api',(req,res)=>res.status(404).json({message:'This isolated demo exposes only account, animal and workflow rehearsal routes.'}));
app.use((error,req,res,next)=>res.status(error.status===400?400:error.status===413?413:503).json({message:error.status===400?'Invalid request body.':error.status===413?'Request body is too large.':'Rehearsal API is unavailable.'}));
const server=app.listen(5004,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
const values={VITE_FIREBASE_API_KEY:'synthetic',VITE_FIREBASE_PROJECT_ID:'demo-mobile-rehearsal',VITE_FIREBASE_AUTH_DOMAIN:'demo-mobile-rehearsal.firebaseapp.com',VITE_FIREBASE_APP_ID:'synthetic-web-demo',VITE_FIREBASE_STORAGE_BUCKET:'',VITE_FIREBASE_MESSAGING_SENDER_ID:''};
const vite=await createServer({configFile:false,envFile:false,plugins:[react()],define:Object.fromEntries(Object.entries(values).map(([k,v])=>[`import.meta.env.${k}`,JSON.stringify(v)])),server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:5004',changeOrigin:true}}}});
await vite.listen();console.log('Synthetic administrator history: http://127.0.0.1:5174/rehearsal/web-demo.html');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await vite.close();server.close();await context.db.terminate();process.exit(0);});
