// Process-crash fixture only. SQL is an explicit local ledger double; no network or real key.
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadCreatorModule} from './creator-youtube-local-modules.mjs';
const send=value=>new Promise((resolve,reject)=>process.send(value,error=>error?reject(error):resolve()));
const pause=async stage=>{await send({paused:stage});await new Promise(()=>{});};
try{
 const [c]=await once(process,'message');
 const overrides=c.mode==='before_proof'?{'node:fs/promises':{...fs,link:async(...args)=>{if(path.dirname(args[1])===path.join(c.root,'attempts',c.jobId)&&path.basename(args[1])==='0000000000000002.json')await pause('before_proof');return fs.link(...args);}}}:{};
 const {CreatorYouTubeFileStore}=loadCreatorModule('creator-youtube-file-store.ts',overrides);
 const {CreatorYouTubeKeyring}=loadCreatorModule('creator-youtube-keyring.ts');
 const {CreatorYouTubeOAuthAttempt}=loadCreatorModule('creator-youtube-oauth-attempt.ts');
 const store=await CreatorYouTubeFileStore.create(path.join(c.root,'attempts'));
 const keys=await CreatorYouTubeFileStore.create(path.join(c.root,'keys'));
 const ring=await CreatorYouTubeKeyring.open(keys,Buffer.from(c.wrappingKey,'base64url'),c.ringId);
 if(c.mode==='after_local_ack'){const cas=store.compareAndSwap.bind(store);store.compareAndSwap=async(...args)=>{const ok=await cas(...args);if(ok&&args[0]===c.jobId&&args[1]===2)await pause('after_local_ack');return ok;};}
 const kernel={
  beginAuthorization:async()=>{throw Error('No new authorization');},
  authorize:async()=>{if(c.mode==='during_dispatch'){await fs.writeFile(path.join(c.root,'mock-sql-dispatch-started'),'started',{flag:'wx'});await pause('during_dispatch');}throw Error('No exchange replay');},
  withdraw:async()=>({local:true,provider:'pending'}),
  closeUnstartedAuthorization:async(jobId,link,reason)=>{
   if(c.mode==='before_sql')await pause('before_sql');
   try{await fs.access(path.join(c.root,'mock-sql-dispatch-started'));throw Error('SQL dispatch already started');}catch(error){if(error.code!=='ENOENT')throw error;}
   const ledger=path.join(c.root,'mock-sql-closure.json');
   let record;try{record=JSON.parse(await fs.readFile(ledger,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(record){if(record.jobId!==jobId||record.link!==link||record.reason!==reason)throw Error('Changed closure');}
   else await fs.writeFile(ledger,JSON.stringify({jobId,link,reason,receipts:1}),{flag:'wx'});
   if(c.mode==='after_sql')await pause('after_sql');
   return{local:true,provider:'none'};
  },
 };
 const flow=new CreatorYouTubeOAuthAttempt({store,kernel,principal:async()=>c.principal,now:()=>c.now},ring,'https://fixture.invalid/youtube/callback',true);
 if(c.mode==='during_dispatch')await flow.callback({jobId:c.jobId,state:c.state,browserNonce:c.browserNonce,code:'MOCK-CODE'});
 else if(c.mode==='recover')await send({result:await flow.recover(c.jobId,c.browserNonce)});
 else await flow.cancel(c.jobId,c.browserNonce);
 process.disconnect();
}catch{await send({error:'closure_fixture_failed'});process.exitCode=1;process.disconnect();}
