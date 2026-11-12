import * as fs from 'node:fs/promises';
import * as sync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'dshsc-independent-data-'));
process.env.DSH_HOME=root;
delete process.env.DSHSC_TEST_HOOKS; delete process.env.DSHSC_FAIL_MOVE; delete process.env.DSHSC_FAIL_MANIFEST;
const {apply}=await import(pathToFileURL(fileURLToPath(new URL('../index.js', import.meta.url))));
const outcomes=[];
function check(name,ok,detail){outcomes.push({name,ok:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(ok?'':' '+JSON.stringify(detail)));}
const exists=async p=>fs.stat(p).then(()=>true,()=>false);
let serial=0;
async function fixture(){
 const home=path.join(root,'case-'+(++serial)); await fs.mkdir(home,{recursive:true}); process.env.DSH_HOME=home;
 const snapshots=[], routes=new Map(), emitted=[], archive=[];
 const services={workspaceRegistry:{list:()=>[],archivedSessionIds:[],pinnedSessionIds:[],archiveSession:async(id)=>archive.push(id),unarchiveSession:async()=>{}},sessionPersistence:{list:async()=>snapshots,stat:async id=>snapshots.find(s=>s.header.id===id)},sessions:{get:id=>id==='live'?{}:undefined},agents:{get:()=>undefined}};
 const ctx={get:k=>services[k],effect:fn=>fn(),emit:(...args)=>{emitted.push(args);ctx.onEmit?.(...args)},webServer:{register:route=>{routes.set(route.path,route.handler);return ()=>{}}}}; apply(ctx);
 async function call(body,headers={},method='POST'){
 const req=(async function*(){yield Buffer.from(JSON.stringify(body));})(); req.method=method;req.headers={host:'localhost:321',...headers};
 let status,data; const res={writeHead:s=>status=s,end:s=>{data=s?JSON.parse(s):undefined}};await routes.get('/dsh-session-cleanup/action')(req,res);return {status,data};
 }
 async function state(){let status,data; await routes.get('/dsh-session-cleanup/state')({method:'GET',headers:{host:'localhost:321'}},{writeHead:s=>status=s,end:s=>data=JSON.parse(s)});return {status,data};}
 async function add(id,cache=false){const dir=path.join(home,'sessions','group',id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'log'),'ORIGINAL-'+id);snapshots.push({header:{id},sizeBytes:10,location:{path:path.join(dir,'log')}});if(cache){await fs.mkdir(path.join(home,'storages/session_projcache/sessions'),{recursive:true});await fs.writeFile(path.join(home,'storages/session_projcache/sessions',id+'.json'),'CACHE-'+id);}return dir;}
 async function batch(name,items,text){const dir=path.join(home,'backups',name);await fs.mkdir(dir,{recursive:true});if(text!==undefined)await fs.writeFile(path.join(dir,'manifest.json'),text);else if(items!==undefined)await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({items}));return dir;}
 return {home,ctx,services,call,state,add,batch,emitted,archive};
}
// Actual filesystem fault AFTER B's session move, rather than developer's pre-move hook.
{
const f=await fixture();await f.add('A');await f.add('B',true);f.ctx.onEmit=()=>{const b=sync.readdirSync(path.join(f.home,'backups'))[0];sync.writeFileSync(path.join(f.home,'backups',b,'projcache'),'OBSTACLE');};
const r=await f.call({op:'delete',sessionIds:['A','B']}); const b=r.data.results[0].batch;
check('post-move filesystem failure: A succeeds B fails',r.data.results[0].ok&&!r.data.results[1].ok,r);
check('post-move failure preserves B source bytes',(await fs.readFile(path.join(f.home,'sessions/group/B/log'),'utf8'))==='ORIGINAL-B');
check('post-move failure preserves B cache',await exists(path.join(f.home,'storages/session_projcache/sessions/B.json')));
check('post-move failure preserves A backup',(await fs.readFile(path.join(f.home,'backups',b,'sessions/group/A/log'),'utf8'))==='ORIGINAL-A');
f.ctx.onEmit=null; const restore=await f.call({op:'restore',batch:b,sessionIds:['A']});check('post-move shared survivor restores',restore.data.restored===1,restore);
}
// Manifest EISDIR after earlier success: no reliance on test hook.
{
const f=await fixture();await f.add('A');await f.add('B',true);f.ctx.onEmit=()=>{const b=sync.readdirSync(path.join(f.home,'backups'))[0];const m=path.join(f.home,'backups',b,'manifest.json');sync.renameSync(m,m+'.saved');sync.mkdirSync(m);};
const r=await f.call({op:'delete',sessionIds:['A','B']});const b=r.data.results[0].batch;
check('real manifest write failure reported',r.data.results[1].error==='manifest-write-failed',r);
check('real manifest failure returns B log',await exists(path.join(f.home,'sessions/group/B/log')));
check('real manifest failure returns B cache',await exists(path.join(f.home,'storages/session_projcache/sessions/B.json')));
check('damaged manifest still lists A',r.data.state.trash.some(x=>x.items.some(i=>i.sessionId==='A')),r.data.state.trash);
f.ctx.onEmit=null;const rr=await f.call({op:'restore',batch:b,sessionIds:['A']});check('damaged manifest survivor can restore',rr.data.restored===1,rr);
}
// Traversal in each user-controlled manifest field, Windows/POSIX forms.
for(const [field,value] of [['cwdDir','../escape'],['cwdDir','..\\escape'],['sessionId','../escape'],['cacheFile','../../CANARY'],['cacheFile','C:\\outside.json'],['cwdDir','/absolute']]){
 const f=await fixture();const item={sessionId:'A',cwdDir:'group',cacheFile:'A.json',[field]:value};const b='session-cleanup-traversal';await f.batch(b,[item]);await fs.writeFile(path.join(f.home,'CANARY'),'KEEP');
 for(const op of ['restore','purge']){const r=await f.call({op,batch:b,sessionIds:[item.sessionId]});check(op+' rejects '+field+' '+value,r.status===200&&r.data.results[0].ok===false,r);}
 check('canary preserved '+field+' '+value,(await fs.readFile(path.join(f.home,'CANARY'),'utf8'))==='KEEP');
}
// Missing/corrupt manifests: logs AND corresponding cache must survive restore.
for(const text of [undefined,'{broken','null','{"items":[null]}']){
 const f=await fixture();const b='session-cleanup-corrupt';const dir=await f.batch(b,undefined,text);await fs.mkdir(path.join(dir,'sessions/group/A'),{recursive:true});await fs.writeFile(path.join(dir,'sessions/group/A/log'),'ORIGINAL-A');await fs.mkdir(path.join(dir,'projcache'),{recursive:true});await fs.writeFile(path.join(dir,'projcache/A.json'),'CACHE-A');
 const s=await f.state();check('discover manifest '+String(text),s.data.trash.some(x=>x.items.some(i=>i.sessionId==='A')),s);
 const r=await f.call({op:'restore',batch:b,sessionIds:['A']});check('restore discovered log '+String(text),r.status===200&&r.data.restored===1,r);
 check('preserve discovered cache '+String(text),await exists(path.join(f.home,'storages/session_projcache/sessions/A.json'))||await exists(path.join(dir,'projcache/A.json')),r);
}
// Malformed but parseable manifest must not shadow a discoverable real session.
{
 const f=await fixture();const b='session-cleanup-invalid';const dir=await f.batch(b,[{sessionId:'A',cwdDir:'..',cacheFile:''}]);await fs.mkdir(path.join(dir,'sessions/group/A'),{recursive:true});await fs.writeFile(path.join(dir,'sessions/group/A/log'),'KEEP');
 const s=await f.state();check('invalid record still discovers actual A',s.data.trash.some(x=>x.items.some(i=>i.sessionId==='A')),s);
 const r=await f.call({op:'restore',batch:b,sessionIds:['A']});check('invalid record does not shadow real A restore',r.status===200&&r.data.restored===1,r);
}
// Cache destination collision: partial restore must be retryable without manual file moves.
{
 const f=await fixture();await f.add('A',true);const d=await f.call({op:'delete',sessionIds:['A']});const b=d.data.results[0].batch;const dest=path.join(f.home,'storages/session_projcache/sessions/A.json');await fs.mkdir(dest);await fs.writeFile(path.join(dest,'block'),'BLOCK');
 const r=await f.call({op:'restore',batch:b,sessionIds:['A']});check('cache restore failure not reported as success',r.data.results[0].ok===false,r);
 await fs.rm(dest,{recursive:true});const retry=await f.call({op:'restore',batch:b,sessionIds:['A']});check('partial restore recovers on retry',retry.data.results[0].ok===true,retry);
}
// Protocol guards and mixed outcomes, archive round trip.
{
 const f=await fixture();await f.add('good');await f.add('live');
 const a=await f.call({op:'archive',sessionIds:['good']});check('archive reaches mock registry',a.data.okCount===1&&f.archive.includes('good'),a);
 const u=await f.call({op:'unarchive',sessionIds:['good']});check('unarchive round trip',u.data.okCount===1,u);
 const r=await f.call({op:'delete',sessionIds:['good','live','missing']});check('mixed outcomes distinct',r.data.results[0].ok===true&&r.data.results[1].skipped===true&&r.data.results[2].error==='session-log-not-found',r);
 check('summary failure count excludes skips',r.data.okCount===1&&r.data.failedCount===1&&r.data.skippedCount===1,{ok:r.data.okCount,failed:r.data.failedCount,skipped:r.data.skippedCount});
 check('wrong method blocked',(await f.call({op:'delete',sessionIds:['live']},{},'GET')).status===405);
 check('cross origin blocked',(await f.call({op:'delete',sessionIds:['live']},{origin:'https://evil.example'})).status===403);
}
const failed=outcomes.filter(x=>!x.ok);console.log(JSON.stringify({root,total:outcomes.length,passed:outcomes.length-failed.length,failed:failed.length},null,2));
await fs.writeFile(path.join(os.tmpdir(),'dshsc-independent-host-results.json'),JSON.stringify({root,outcomes},null,2));
process.exitCode=failed.length?1:0;