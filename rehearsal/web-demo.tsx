import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {auth,app} from '../src/firebase';
import {OperationsPage} from '../src/OperationsPage';
import {UsersPage} from '../src/UsersPage';
import {AnimalsPage} from '../src/AnimalsPage';
import '../src/index.css';
if(!import.meta.env.DEV||app?.options.projectId!=='demo-mobile-rehearsal'||!['127.0.0.1','localhost'].includes(location.hostname)||!auth)throw Error('The demo UI requires an isolated local demo configuration.');
connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:false});
function Demo(){
  const [uid,setUid]=useState<string|null>(null),[error,setError]=useState('');
  const [page,setPage]=useState('users');
  useEffect(()=>onAuthStateChanged(auth!,user=>setUid(user?.uid||null)),[]);
  return <main className="mx-auto max-w-5xl space-y-5 p-6"><section className="rounded-2xl bg-amber-50 p-5 text-amber-900"><h1 className="text-2xl font-bold">All-role synthetic rehearsal</h1><p className="mt-2">Fictional businesses, demo charges and local emulators only. This panel uses the existing web workflow history component and server handlers. Your normal web dashboard remains separate.</p></section>
    {uid?<><button className="btn-secondary" onClick={()=>void signOut(auth!)}>Sign out of demo</button>
      <nav aria-label="Rehearsal screens" className="flex gap-3">{['users','animals','operations'].map(value=><button key={value} className="btn-secondary" aria-pressed={page===value} onClick={()=>setPage(value)}>{value==='users'?'Mobile users':value==='animals'?'Animals':'Workflow history'}</button>)}</nav>
      {page==='users'?<UsersPage/>:page==='animals'?<AnimalsPage/>:<OperationsPage/>}
    </>:<section className="rounded-2xl border bg-white p-6"><p>Open the administrator demo history with its public synthetic account.</p><button className="btn-primary mt-4" onClick={()=>{setError('');void signInWithEmailAndPassword(auth!,'web-admin@rehearsal.example.test','Synthetic-only-42!').catch(()=>setError('Demo login failed. Check the local Auth service.'));}}>Open demo administrator history</button>{error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}</section>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Demo/>);
