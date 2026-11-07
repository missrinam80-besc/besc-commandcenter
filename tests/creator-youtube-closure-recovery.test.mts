import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadCreatorModule} from './helpers/creator-youtube-local-modules.mjs';
const {CreatorYouTubeFileStore}=loadCreatorModule('creator-youtube-file-store.ts') as typeof import('../src/lib/creator-youtube-file-store.ts');
const {CreatorYouTubeKeyring}=loadCreatorModule('creator-youtube-keyring.ts') as typeof import('../src/lib/creator-youtube-keyring.ts');
const {CreatorYouTubeOAuthAttempt}=loadCreatorModule('creator-youtube-oauth-attempt.ts') as typeof import('../src/lib/creator-youtube-oauth-attempt.ts');
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0)){assert.equal(path.dirname(path.resolve(root)),path.resolve(tmpdir()));assert(path.basename(root).startsWith('besc-ca03-close-'));await rm(root,{recursive:true,force:true});}});
function worker(config:Record<string,unknown>){
 const child=fork(new URL('./helpers/creator-youtube-closure-worker.mjs',import.meta.url),[],{stdio:['ignore','pipe','pipe','ipc'],env:{NODE_ENV:'test',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});
 const messages:Record<string,unknown>[]=[],waiting:{resolve:(m:Record<string,unknown>)=>void;reject:(e:Error)=>void}[]=[];let ended=false;
 const exit=new Promise<void>(resolve=>child.once('exit',()=>{ended=true;for(const w of waiting.splice(0))w.reject(Error('Fixture exited'));resolve();}));
 child.on('message',(m:Record<string,unknown>)=>{const w=waiting.shift();if(w)w.resolve(m);else messages.push(m);});child.on('error',error=>{for(const w of waiting.splice(0))w.reject(error);});child.send(config);
 return{exit,next:()=>new Promise<Record<string,unknown>>((resolve,reject)=>{const m=messages.shift();if(m)resolve(m);else if(ended)reject(Error('Fixture exited'));else waiting.push({resolve,reject});}),kill:async()=>{child.kill('SIGKILL');await exit;}};
}
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'besc-ca03-close-'));roots.push(root);
 const store=await CreatorYouTubeFileStore.create(path.join(root,'attempts')),keys=await CreatorYouTubeFileStore.create(path.join(root,'keys')),wrappingKey=randomBytes(32),ringId=randomUUID(),ring=await CreatorYouTubeKeyring.initialize(keys,wrappingKey,ringId);
 const principal={organizationId:randomUUID(),userId:randomUUID(),sessionId:randomUUID()},now=Date.now(),link=randomUUID(),jobId=randomUUID(),state=randomBytes(32).toString('hex');
 const kernel={beginAuthorization:async()=>({jobId,state}),authorize:async()=>{throw Error('No provider allowed');},withdraw:async()=>({local:true,provider:'pending' as const})};
 const flow=new CreatorYouTubeOAuthAttempt({store,kernel,principal:async()=>principal,now:()=>now},ring,'https://fixture.invalid/youtube/callback',true),pending=await flow.begin(link);
 return{root,ring,config:{root,wrappingKey:wrappingKey.toString('base64url'),ringId,principal,now,...pending,link}};
}
for(const mode of ['before_proof','before_sql','after_sql','after_local_ack'])test(`CA03 closure recovery: process termination ${mode} preserves honest terminal recovery`,async()=>{
 const f=await fixture(),w=worker({...f.config,mode});try{assert.equal((await w.next()).paused,mode);}finally{await w.kill();}
 await f.ring.rotate(randomUUID());const recovered=worker({...f.config,now:f.config.now+300001,mode:'recover'}),message=await recovered.next();await recovered.exit;
 assert.equal((message.result as {provider:string}).provider,'none');
 const record=JSON.parse(await readFile(path.join(f.root,'mock-sql-closure.json'),'utf8'));assert.equal(record.receipts,1);assert.equal(record.reason,mode==='before_proof'?'expired':'cancelled');
 const repeated=worker({...f.config,now:f.config.now+300001,mode:'recover'});assert.equal(((await repeated.next()).result as {provider:string}).provider,'none');await repeated.exit;
 assert.equal(JSON.parse(await readFile(path.join(f.root,'mock-sql-closure.json'),'utf8')).receipts,1);
});
test('CA03 closure recovery: killed claimed exchange never gets a no-exchange closure',async()=>{
 const f=await fixture(),w=worker({...f.config,mode:'during_dispatch'});try{assert.equal((await w.next()).paused,'during_dispatch');}finally{await w.kill();}
 const recovery=worker({...f.config,now:f.config.now+300001,mode:'recover'});assert.equal(((await recovery.next()).result as {provider:string}).provider,'pending');await recovery.exit;
 await assert.rejects(readFile(path.join(f.root,'mock-sql-closure.json')),{code:'ENOENT'});
});
