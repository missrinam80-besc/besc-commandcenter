// Standalone Node 24 adapter. No dependencies, database, inbound socket or rewards.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=text=>createHash('sha256').update(text).digest('hex');
export function referenceKey(value){return hash(value.kind+'|'+value.reference_id);}
export function validateReference(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='canonical_url,kind,occurred_at,reference_id,schemaVersion'||v.schemaVersion!==1||typeof v.occurred_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.occurred_at)||!Number.isFinite(Date.parse(v.occurred_at)))throw Error('invalid_reference');
 const ref=typeof v.reference_id==='string'?v.reference_id:'';
 if(v.kind==='clip'&&/^clip:[A-Za-z0-9_-]{1,100}$/.test(ref)&&v.canonical_url==='https://clips.twitch.tv/'+ref.slice(5))return v;
 if(v.kind==='video'&&/^video:\d{1,30}$/.test(ref)&&v.canonical_url==='https://www.twitch.tv/videos/'+ref.slice(6))return v;
 if(v.kind==='stream'&&/^stream:\d{1,30}$/.test(ref)&&/^https:\/\/www\.twitch\.tv\/[a-z0-9_]{1,25}$/.test(v.canonical_url))return v;
 throw Error('invalid_reference');
}
/** @param {Record<string,string|undefined>} env */
export function loadBridgeConfig(env=process.env){
 const enabled=env.BESC_REFERENCE_FORWARD_ENABLED??'false';if(!['true','false'].includes(enabled))throw Error('invalid_flag');if(enabled!=='true')return null;
 const api=new URL(env.BESC_REFERENCE_API_URL??'');
 if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash||api.pathname!=='/api/v1/integrations/campaigns/references')throw Error('invalid_endpoint');
 const source=env.BESC_REFERENCE_SOURCE_ID??'',broadcaster=env.BESC_REFERENCE_BROADCASTER_ID??'',key=env.BESC_REFERENCE_API_KEY??'',directory=env.BESC_REFERENCE_QUEUE_DIR??'';
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(source)||!/^[1-9]\d{0,19}$/.test(broadcaster)||!/^bcr_[a-z0-9-]{3,64}\.[A-Za-z0-9_-]{43}$/.test(key)||!path.isAbsolute(directory)||directory.startsWith('\\\\'))throw Error('invalid_config');
 return{api:api.href,source,broadcaster,key,directory:path.resolve(directory),binding:hash(JSON.stringify([api.href,source,broadcaster]))};
}
async function safeDirectory(root,name){const dir=path.join(root,name);await fs.mkdir(dir,{recursive:true,mode:0o700});const info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink())throw Error('unsafe_queue');return dir;}
async function readJson(file){const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>4096)throw Error('invalid_queue_file');return JSON.parse(await fs.readFile(file,'utf8'));}
async function acquire(root,binding){
 const file=path.join(root,'.bridge.lock');
 try{await fs.writeFile(file,JSON.stringify({pid:process.pid,binding}),{flag:'wx',mode:0o600});}
 catch(error){if(error.code!=='EEXIST')throw error;const old=await readJson(file);if(old.binding!==binding||!Number.isSafeInteger(old.pid)||old.pid<=0)throw Error('queue_locked');
  let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw Error('queue_locked');await fs.unlink(file);await fs.writeFile(file,JSON.stringify({pid:process.pid,binding}),{flag:'wx',mode:0o600});}
 return async()=>{await fs.unlink(file);};
}
export async function processQueueOnce(config,fetcher=fetch,now=Date.now()){
 if(!config)return{disabled:true,sent:0};
 await fs.mkdir(config.directory,{recursive:true,mode:0o700});if((await fs.lstat(config.directory)).isSymbolicLink())throw Error('unsafe_queue');
 const root=await fs.realpath(config.directory),inbox=await safeDirectory(root,'inbox'),sent=await safeDirectory(root,'sent'),failed=await safeDirectory(root,'failed'),state=await safeDirectory(root,'state');
 const release=await acquire(root,config.binding);
 try{
  const binding=path.join(root,'.binding.json');try{await fs.writeFile(binding,JSON.stringify({binding:config.binding}),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST'||(await readJson(binding)).binding!==config.binding)throw Error('queue_binding_changed');}
  const names=(await fs.readdir(inbox)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort();if(names.length>2000)throw Error('queue_capacity');let delivered=0,quarantined=0;
  for(const name of names.slice(0,20)){
   const file=path.join(inbox,name),retryFile=path.join(state,name);let retry={attempts:0,next:0};try{retry=await readJson(retryFile);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!Number.isSafeInteger(retry.attempts)||retry.attempts<0||!Number.isFinite(retry.next))throw Error('invalid_retry_state');if(retry.next>now)continue;
   let value;try{value=validateReference(await readJson(file));if(referenceKey(value)+'.json'!==name)throw Error();}catch{await fs.rename(file,path.join(failed,name));quarantined++;continue;}
   let terminal=false,response;
   try{
    response=await fetcher(config.api,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify({source_id:config.source,broadcaster_id:config.broadcaster,reference:value})});
    if([401,403,404].includes(response.status)){void response.body?.cancel();return{sent:delivered,quarantined,paused:true};}
    terminal=[400,409,413,415,422].includes(response.status);
    if(response.ok){const reader=response.body?.getReader();if(!reader)throw Error('invalid_ack');let text='',size=0;while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>4096){void reader.cancel();throw Error('invalid_ack');}text+=new TextDecoder().decode(next.value,{stream:true});}
     const ack=JSON.parse(text);if(!ack.accepted||ack.providerVerified!==false||ack.awarded!==false||typeof ack.replay!=='boolean'||!/^[a-f0-9-]{36}$/i.test(ack.receiptId))throw Error('invalid_ack');
     const archive=path.join(sent,name);try{const old=await readJson(archive);if(old.reference_id!==value.reference_id||old.canonical_url!==value.canonical_url||old.kind!==value.kind)throw Error('archive_conflict');await fs.unlink(file);}catch(e){if(e.code!=='ENOENT')throw e;await fs.rename(file,archive);}
     await fs.unlink(retryFile).catch(e=>{if(e.code!=='ENOENT')throw e;});delivered++;continue;
    }
    if(!response.ok)void response.body?.cancel();
   }catch{/* uncertain outcome: keep the exact original file and key */}
   if(terminal){await fs.rename(file,path.join(failed,name));quarantined++;continue;}
   retry={attempts:retry.attempts+1,next:now+Math.min(3600000,2000*2**Math.min(retry.attempts,10))};
   const temp=retryFile+'.tmp';await fs.writeFile(temp,JSON.stringify(retry),{mode:0o600});await fs.rename(temp,retryFile);
  }
  return{sent:delivered,quarantined};
 }finally{await release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const config=loadBridgeConfig();
  if(!process.argv.includes('--run'))console.log(JSON.stringify({configuration_valid:Boolean(config),disabled:!config,forwarded:false}));
  else if(!config)console.log(JSON.stringify({disabled:true}));
  else{do{console.log(JSON.stringify(await processQueueOnce(config)));if(process.argv.includes('--once'))break;await new Promise(resolve=>setTimeout(resolve,2000));}while(true);}
 }catch{console.error('De bronadapter is gestopt. Controleer de afgeschermde configuratie en wachtrij.');process.exitCode=1;}
}
