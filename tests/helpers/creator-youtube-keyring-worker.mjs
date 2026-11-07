// Local synthetic key fixtures only. Never load an environment key or provider credential.
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {loadCreatorModule} from './creator-youtube-local-modules.mjs';
const send=message=>new Promise((resolve,reject)=>process.send(message,error=>error?reject(error):resolve()));
async function pause(at){await send({paused:at});await new Promise(()=>{});}
try{
 const [config]=await once(process,'message');const {mode}=config,overrides={};
 if(mode==='rotate_pre_crash'||mode==='rotate_post_crash')overrides['node:fs/promises']={...fs,link:async(...args)=>{if(mode==='rotate_pre_crash')await pause('before_rotation_publish');await fs.link(...args);await pause('after_rotation_publish');}};
 const {CreatorYouTubeFileStore}=loadCreatorModule('creator-youtube-file-store.ts',overrides);
 const {CreatorYouTubeKeyring}=loadCreatorModule('creator-youtube-keyring.ts');
 const store=await CreatorYouTubeFileStore.create(config.keyRoot);
 const ring=await CreatorYouTubeKeyring.open(store,Buffer.from(config.wrappingKey,'base64url'),config.ringId);
 if(mode==='rotate'){
  await send({armed:true});await once(process,'message');await send({result:await ring.rotate(config.requestId)});
 }else if(mode==='rotate_pre_crash'||mode==='rotate_post_crash')await ring.rotate(config.requestId);
 else if(mode==='begin'){
  const {CreatorYouTubeOAuthAttempt}=loadCreatorModule('creator-youtube-oauth-attempt.ts');
  const attempts=await CreatorYouTubeFileStore.create(config.attemptRoot);
  const kernel={beginAuthorization:async()=>({jobId:config.id,state:config.state}),authorize:async()=>{throw Error('Not permitted in begin fixture');},withdraw:async()=>{throw Error('Not permitted in begin fixture');}};
  const flow=new CreatorYouTubeOAuthAttempt({store:attempts,kernel,principal:async()=>config.principal,now:()=>config.now},ring,'https://fixture.invalid/youtube/callback',true);
  await send({result:await flow.begin(config.link)});
 }else await send({result:await ring.describe()});
 process.disconnect();
}catch{await send({error:'fixture_keyring_not_confirmed'});process.exitCode=1;process.disconnect();}
