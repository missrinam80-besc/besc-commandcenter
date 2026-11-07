import 'server-only';
import {link,lstat,mkdir,open,readdir,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {CreatorAttemptStore} from './creator-youtube-oauth-attempt';

const idSchema=z.string().uuid().regex(/^[a-f0-9-]+$/);
const recordSchema=z.object({revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1),sealed:z.string().min(40).max(16000).regex(/^[A-Za-z0-9_-]+$/)}).strict();
type RecordValue=z.infer<typeof recordSchema>;
const missing=(e:unknown,code:string)=>typeof e==='object'&&e!==null&&'code'in e&&e.code===code;
const normalized=(p:string)=>process.platform==='win32'?p.toLowerCase():p;

// Explicit local-disk adapter, never selected automatically. No credentials or key are stored here.
// Immutable synced revisions + no-replace hard-link publication provide cross-process CAS.
export class CreatorYouTubeFileStore implements CreatorAttemptStore {
 private constructor(private readonly root:string){}
 static async create(directory:string){
  try{
   if(!path.isAbsolute(directory)||/^[\\/]{2}/.test(directory))throw Error('Local absolute directory required');
   const root=path.resolve(directory);
   if(root===path.parse(root).root)throw Error('Dedicated directory required');
   await mkdir(root,{recursive:true,mode:0o700});
   const stat=await lstat(root);
   if(!stat.isDirectory()||stat.isSymbolicLink()||(process.platform!=='win32'&&(stat.mode&0o077)!==0)||normalized(await realpath(root))!==normalized(root))throw Error('Unsafe directory');
   return new CreatorYouTubeFileStore(root);
  }catch{throw Error('creator_attempt_storage_unavailable');}
 }
 private async directory(id:string,create=false){
  idSchema.parse(id);const directory=path.join(this.root,id);
  const root=await lstat(this.root);
  if(!root.isDirectory()||root.isSymbolicLink()||(process.platform!=='win32'&&(root.mode&0o077)!==0)||normalized(await realpath(this.root))!==normalized(this.root))throw Error('Unsafe root');
  if(create)await mkdir(directory,{mode:0o700}).catch(e=>{if(!missing(e,'EEXIST'))throw e;});
  const stat=await lstat(directory).catch(e=>{if(missing(e,'ENOENT'))return null;throw e;});
  if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()||(process.platform!=='win32'&&(stat.mode&0o077)!==0)||normalized(await realpath(directory))!==normalized(directory)))throw Error('Unsafe request directory');
  return stat?directory:null;
 }
 private async readAt(directory:string):Promise<RecordValue|null>{
  const names=await readdir(directory),revisions:string[]=[];
  for(const name of names){if(/^\.tmp-[a-f0-9-]{36}$/.test(name))continue;if(!/^\d{16}\.json$/.test(name))throw Error('Unknown record');revisions.push(name);}
  revisions.sort();if(!revisions.length)return null;
  for(let i=0;i<revisions.length;i++)if(revisions[i]!==`${String(i+1).padStart(16,'0')}.json`)throw Error('Incomplete revision history');
  const filename=path.join(directory,revisions.at(-1)!);const stat=await lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||(process.platform!=='win32'&&(stat.mode&0o077)!==0)||stat.size>17000)throw Error('Invalid record');
  const file=await open(filename,'r');try{
   const actual=await file.stat();if(actual.ino!==stat.ino||actual.size>17000)throw Error('Changed record');
   const record=recordSchema.parse(JSON.parse(await file.readFile('utf8')));
   if(record.revision!==revisions.length)throw Error('Invalid revision');return record;
  }finally{await file.close();}
 }
 async read(id:string){try{const directory=await this.directory(id);return directory?await this.readAt(directory):null;}catch{throw Error('creator_attempt_storage_unavailable');}}
 private async syncDirectory(directory:string){
  // Windows does not expose a portable directory-fsync through this API.
  // Process-restart recovery is tested there; power-loss durability is not claimed.
  if(process.platform==='win32')return;
  const handle=await open(directory,'r');try{await handle.sync();}finally{await handle.close();}
 }
 async compareAndSwap(id:string,expectedRevision:number|null,next:RecordValue){
  let temporary:string|undefined;
  try{
   recordSchema.parse(next);
   if(expectedRevision!==null&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))throw Error('Invalid expected revision');
   if(next.revision!==(expectedRevision??0)+1)throw Error('Invalid next revision');
   const directory=(await this.directory(id,true))!;
   const previous=await this.readAt(directory);if((previous?.revision??null)!==expectedRevision)return false;
   temporary=path.join(directory,`.tmp-${randomUUID()}`);
   const file=await open(temporary,'wx',0o600);
   try{await file.writeFile(JSON.stringify(next)+'\n','utf8');await file.sync();}finally{await file.close();}
   const destination=path.join(directory,`${String(next.revision).padStart(16,'0')}.json`);
   try{await link(temporary,destination);}catch(e){if(missing(e,'EEXIST'))return false;throw e;}
   await this.syncDirectory(directory);await this.syncDirectory(this.root);
   return true;
  }catch{throw Error('creator_attempt_storage_unavailable');}
  finally{if(temporary)await unlink(temporary).catch(()=>undefined);}
 }
}
