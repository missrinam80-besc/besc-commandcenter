import { z } from 'zod';
import { parsePilotPostUrl } from './campaign-pilot.ts';

export async function readCampaignJson(request: Request, maximum = 8192): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw Error('json_required');
  const reader = request.body?.getReader(); if (!reader) throw Error('invalid_body');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_,reject) => { timer=setTimeout(()=>reject(Error('body_timeout')),1500); });
  try {
    return await Promise.race([(async()=>{
      const parts:Uint8Array[]=[];let size=0;
      while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum)throw Error('body_too_large');parts.push(next.value);}
      const all=new Uint8Array(size);let at=0;for(const part of parts){all.set(part,at);at+=part.byteLength;}
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
    })(),timeout]);
  } catch(error){void reader.cancel().catch(()=>{});throw error;} finally{clearTimeout(timer);}
}
const snow=z.string().regex(/^[1-9]\d{16,19}$/);
export const botCampaignSubmission=z.object({guild_id:snow,discord_user_id:snow,idempotency_key:snow,
  data:z.object({campaign_id:z.uuid(),url:z.string().max(2048)}).strict()}).strict();
export function parsedCampaignSubmission(input:unknown){
  const value=botCampaignSubmission.safeParse(input);if(!value.success)throw Error('invalid_fields');
  const parsed=value.data,post=parsePilotPostUrl(parsed.data.url);
  if(!post)throw Error('invalid_fields');return {...parsed,post};
}
export const campaignReferenceSchema=z.object({schemaVersion:z.literal(1),kind:z.enum(['clip','video','stream']),
  reference_id:z.string().max(108),canonical_url:z.string().max(200),occurred_at:z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s)}).strict().refine(v=>{
  if(v.kind==='stream')return /^stream:\d{1,30}$/.test(v.reference_id)&&/^https:\/\/www\.twitch\.tv\/[a-z0-9_]{1,25}$/.test(v.canonical_url);
  const post=parsePilotPostUrl(v.canonical_url);return post?.platform==='twitch'&&post.externalId===v.reference_id&&v.reference_id.startsWith(v.kind+':')&&post.canonicalUrl===v.canonical_url;
});
