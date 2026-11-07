// Process-crash fixture: only synthetic identity, keys and provider answers are accepted.
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadCreatorModule} from './creator-youtube-local-modules.mjs';
const send=message=>new Promise((resolve,reject)=>process.send(message,error=>error?reject(error):resolve()));
async function pause(at){await send({paused:at});await new Promise(()=>{});}
try{
 const [config]=await once(process,'message'),{mode}=config,overrides={};
 if(['capture_pre_crash','capture_post_crash','release_ack_crash'].includes(mode))overrides['node:fs/promises']={...fs,link:async(...args)=>{
  const target=String(args[1]),capture=path.dirname(path.dirname(target))===config.receiptRoot&&target.endsWith('0000000000000002.json'),release=path.dirname(path.dirname(target))===config.attemptRoot&&!target.includes(config.jobId)&&target.endsWith('0000000000000002.json');
  if(mode==='capture_pre_crash'&&capture)await pause('before_refresh_capture');
  await fs.link(...args);
  if(mode==='capture_post_crash'&&capture)await pause('after_refresh_capture');
  if(mode==='release_ack_crash'&&release)await pause('after_slot_release');
 }};
 const {CreatorYouTubeFileStore}=loadCreatorModule('creator-youtube-file-store.ts',overrides),{CreatorYouTubeKeyring}=loadCreatorModule('creator-youtube-keyring.ts'),{CreatorYouTubeProviderInbox}=loadCreatorModule('creator-youtube-provider-inbox.ts'),{CreatorYouTubeOAuthAttempt}=loadCreatorModule('creator-youtube-oauth-attempt.ts');
 const ring=await CreatorYouTubeKeyring.open(await CreatorYouTubeFileStore.create(config.keyRoot),Buffer.from(config.wrappingKey,'base64url'),config.ringId);
 const responses=new CreatorYouTubeProviderInbox(await CreatorYouTubeFileStore.create(config.receiptRoot),ring,true);
 if(mode==='applied_crash'){const applied=responses.applied.bind(responses);responses.applied=async b=>{await applied(b);await pause('after_refresh_applied');};}
 const kernel={beginAuthorization:async()=>{throw Error('No authorization in refresh fixture');},authorize:async()=>{throw Error('No authorization in refresh fixture');},withdraw:async()=>({local:true,provider:'complete'}),recoverCapturedAuthorization:async()=>{if(mode==='cleanup_crash')await pause('during_refresh_cleanup');return 'complete';},refreshPrepared:async(_job,beforeCommit,receive)=>{
  await receive(async()=>{await fs.appendFile(config.counter,'refresh\n');if(mode==='exchange_crash')await pause('during_refresh');return config.answer;});
  await beforeCommit();if(mode==='after_capture_crash')await pause('after_capture_before_refresh_commit');if(mode==='cleanup_crash')throw Error('MOCK commit failure');
 }};
 const flow=new CreatorYouTubeOAuthAttempt({store:await CreatorYouTubeFileStore.create(config.attemptRoot),kernel,responses,principal:async()=>config.principal,now:()=>config.now},ring,'https://fixture.invalid/youtube/callback',true);
 if(mode==='concurrent'){await send({armed:true});await once(process,'message');}
 await send({result:await flow.refresh(config.jobId,config.browserNonce)});process.disconnect();
}catch{await send({error:'fixture_refresh_not_confirmed'});process.exitCode=1;process.disconnect();}
