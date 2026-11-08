import 'server-only';
import {lstat,open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {createClient} from './supabase/server';
import {createAdminClient} from './supabase/admin';
import {getSupabaseServerUrl} from './supabase/url';
import {CreatorYouTubeSession} from './creator-youtube-session';
import {CreatorYouTubeGoogle} from './creator-youtube-google';
import {CreatorYouTubeFileStore} from './creator-youtube-file-store';
import {CreatorYouTubeKeyring} from './creator-youtube-keyring';
import {createCreatorYouTubeApplication} from './creator-youtube-application';

const configuration=z.object({organizationId:z.string().uuid(),origin:z.string().url(),storageRoot:z.string(),wrappingKeyFile:z.string(),keyringId:z.string().uuid(),pilot:z.object({ownerId:z.string().uuid(),channelId:z.string().regex(/^UC[A-Za-z0-9_-]{22}$/),expiresAt:z.string().datetime({offset:true})}).strict(),google:z.object({clientId:z.string(),clientSecret:z.string(),isolatedProject:z.literal(true)}).strict()}).strict();
export function creatorYouTubeEnabled(){return process.env.BESC_CREATOR_YOUTUBE_ENABLED==='true';}
function samePath(a:string,b:string){return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;}
async function existing(filename:string,directory=false){
 if(!path.isAbsolute(filename)||/^[\\/]{2}/.test(filename))throw Error('Dedicated local path required');
 const resolved=path.resolve(filename),stat=await lstat(resolved);
 if(stat.isSymbolicLink()||!samePath(await realpath(resolved),resolved)||(directory?!stat.isDirectory():!stat.isFile())||(process.platform!=='win32'&&(stat.mode&0o077)!==0))throw Error('Private path required');return{resolved,stat};
}
async function privateFile(filename:string,max:number){
 const before=await existing(filename);if(before.stat.size>max)throw Error('File limit');
 const file=await open(before.resolved,'r');try{const stat=await file.stat();if(stat.ino!==before.stat.ino||stat.size>max)throw Error('Changed file');const bytes=await file.readFile();if(bytes.length>max)throw Error('File limit');return bytes;}finally{await file.close();}
}
// No auto-initialization, default key, organization OAuth fallback or shared process session.
// Enabling this requires separately provisioned private files and an existing keyring.
async function readConfiguration(){
 const filename=process.env.BESC_CREATOR_YOUTUBE_CONFIG_FILE;if(!filename)throw Error('No creator configuration');
 const raw=await privateFile(filename,16384);let c:z.infer<typeof configuration>;try{c=configuration.parse(JSON.parse(raw.toString('utf8')));}finally{raw.fill(0);}
 return{c,filename};
}
export async function creatorYouTubePilotVisible(userId:string){
 if(!creatorYouTubeEnabled())return false;
 try{const {c}=await readConfiguration();return c.pilot.ownerId===userId;}catch{return false;}
}
async function application(){
 const {c,filename}=await readConfiguration();
 if(new URL(c.origin).origin!==c.origin||!c.origin.startsWith('https://')||c.origin!==process.env.NEXT_PUBLIC_SITE_URL)throw Error('Exact origin required');
 const browser=await createClient();
 const session=new CreatorYouTubeSession(browser,bearer=>createSupabaseClient(getSupabaseServerUrl(),process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{accessToken:async()=>bearer,auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}}),()=>createAdminClient(),c.organizationId,true,c.pilot);
 await session.authenticate();
 const root=(await existing(c.storageRoot,true)).resolved,wrap=(await existing(c.wrappingKeyFile)).resolved;
 for(const candidate of [filename,root,wrap]){const inApp=path.relative(process.cwd(),path.resolve(candidate));if(!inApp.startsWith('..'+path.sep)&&inApp!=='..'&&!path.isAbsolute(inApp))throw Error('Secrets and storage must be outside the application tree');}
 const relative=path.relative(root,wrap);if(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw Error('Wrapping key must be separate from storage');
 const directories=['attempts','receipts','keys'].map(name=>path.join(root,name));for(const dir of directories)await existing(dir,true);
 const keyFile=await privateFile(wrap,64);let ring:CreatorYouTubeKeyring;
 try{const encoded=keyFile.toString('utf8').trim();if(!/^[A-Za-z0-9_-]{43}$/.test(encoded))throw Error('Invalid wrapping key');const key=Buffer.from(encoded,'base64url');try{ring=await CreatorYouTubeKeyring.open(await CreatorYouTubeFileStore.create(directories[2]),key,c.keyringId);}finally{key.fill(0);}}finally{keyFile.fill(0);}
 const google=new CreatorYouTubeGoogle({...c.google,redirectUri:c.origin+'/auth/creator-youtube/callback'},(url,init)=>fetch(url,init),Date.now,true);
 return createCreatorYouTubeApplication({session,google,cipher:ring,attempts:await CreatorYouTubeFileStore.create(directories[0]),receipts:await CreatorYouTubeFileStore.create(directories[1]),origin:c.origin},true);
}
export async function creatorYouTubeRoute(request:Request,operation:'action'|'callback'|'status'){
 const unavailable=()=>Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 if(!creatorYouTubeEnabled())return unavailable();
 try{return await(await application())[operation](request);}catch{return unavailable();}
}
