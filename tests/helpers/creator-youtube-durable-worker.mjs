// Separate local process; all keys, identity and provider results are synthetic test fixtures.
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {loadCreatorModule} from './creator-youtube-local-modules.mjs';
const send=message=>new Promise((resolve,reject)=>process.send(message,error=>error?reject(error):resolve()));
async function pause(at){await send({paused:at});await new Promise(()=>{});}
try{
 const [config]=await once(process,'message');
 const {mode,root,id}=config;
 const overrides={};
 if(mode==='prepublish_crash'||mode==='postpublish_crash')overrides['node:fs/promises']={...fs,link:async(...args)=>{if(mode==='prepublish_crash')await pause('before_publish');await fs.link(...args);await pause('after_publish');}};
 const {CreatorYouTubeFileStore}=loadCreatorModule('creator-youtube-file-store.ts',overrides);
 const store=await CreatorYouTubeFileStore.create(root);
 if(mode==='cas'){
  await send({armed:true});await once(process,'message');
  await send({result:await store.compareAndSwap(id,config.expected,{revision:(config.expected??0)+1,sealed:config.sealed})});
 }else if(mode==='prepublish_crash'||mode==='postpublish_crash'){
  await store.compareAndSwap(id,null,{revision:1,sealed:'A'.repeat(80)});
 }else{
  const {CreatorYouTubeOAuthAttempt}=loadCreatorModule('creator-youtube-oauth-attempt.ts');
  const kernel={beginAuthorization:async()=>({jobId:id,state:config.state}),authorize:async()=>{
   if(mode==='exchange_crash')await pause('provider_exchange');
   if(mode==='recover')throw Error('Recovery must never exchange a code');
  },withdraw:async()=>{
   if(mode==='withdraw_crash')await pause('provider_withdrawal');
   return{local:true,provider:config.provider??'complete'};
  }};
  if(mode==='ack_crash'){
   const cas=store.compareAndSwap.bind(store);
   store.compareAndSwap=async(...args)=>{const result=await cas(...args);if(args[1]===2&&result)await pause('completed_before_ack');return result;};
  }
  const flow=new CreatorYouTubeOAuthAttempt({store,kernel,principal:async()=>config.principal,now:()=>config.now},Buffer.from(config.key,'base64url'),'https://fixture.invalid/youtube/callback',true);
  if(mode==='begin')await send({result:await flow.begin(config.link)});
  if(mode==='exchange_crash'||mode==='ack_crash')await send({result:await flow.callback(config.callback)});
  if(mode==='withdraw_crash')await send({result:await flow.cancel(id,config.browserNonce)});
  if(mode==='recover')await send({result:await flow.recover(id,config.browserNonce)});
 }
 process.disconnect();
}catch(error){await send({error:error instanceof Error?error.message:'Fixture failed'});process.exitCode=1;process.disconnect();}
