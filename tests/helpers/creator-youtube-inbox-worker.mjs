// No real provider, keys or credentials: this process receives only synthetic fixture input.
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {loadCreatorModule} from './creator-youtube-local-modules.mjs';
const send=message=>new Promise((resolve,reject)=>process.send(message,error=>error?reject(error):resolve()));
async function pause(at){await send({paused:at});await new Promise(()=>{});}
try{
 const [config]=await once(process,'message'),{mode}=config,overrides={};
 if(['capture_pre_crash','capture_post_crash','cleanup_ack_crash'].includes(mode))overrides['node:fs/promises']={...fs,link:async(...args)=>{
  const target=String(args[1]),capture=target.endsWith('0000000000000002.json'),cleanup=target.endsWith('0000000000000004.json');
  if(mode==='capture_pre_crash'&&capture)await pause('before_answer_publish');
  await fs.link(...args);
  if(mode==='capture_post_crash'&&capture)await pause('after_answer_publish');
  if(mode==='cleanup_ack_crash'&&cleanup)await pause('after_cleanup_publish');
 }};
 const {CreatorYouTubeFileStore}=loadCreatorModule('creator-youtube-file-store.ts',overrides);
 const {CreatorYouTubeKeyring}=loadCreatorModule('creator-youtube-keyring.ts');
 const {CreatorYouTubeProviderInbox}=loadCreatorModule('creator-youtube-provider-inbox.ts');
 const ring=await CreatorYouTubeKeyring.open(await CreatorYouTubeFileStore.create(config.keyRoot),Buffer.from(config.wrappingKey,'base64url'),config.ringId);
 const inbox=new CreatorYouTubeProviderInbox(await CreatorYouTubeFileStore.create(config.receiptRoot),ring,true);
 if(mode==='receive'){
  await send({armed:true});await once(process,'message');await inbox.receive(config.binding,async()=>config.answer);await send({result:'received'});
 }else if(mode==='cleanup_crash'||mode==='cleanup_ack_crash'){
  const result=await inbox.recover(config.binding,async()=>{if(mode==='cleanup_crash')await pause('during_cleanup');return 'complete';});await send({result});
 }else{
  await inbox.receive(config.binding,async()=>{if(mode==='exchange_crash')await pause('during_exchange');return config.answer;});
  if(mode==='after_receive_crash')await pause('after_capture_before_activation');
  if(mode==='applied_crash'){await inbox.applied(config.binding);await pause('after_applied_before_completion');}
 }
 process.disconnect();
}catch{await send({error:'fixture_response_not_confirmed'});process.exitCode=1;process.disconnect();}
