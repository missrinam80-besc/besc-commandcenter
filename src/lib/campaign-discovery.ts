import { withBotUpstream } from './bot-api-upstream.ts';
import { CampaignSourceError } from './campaign-twitch.ts';
export type DiscoveredCampaignItem={kind:'video'|'clip';external_id:string;url:string;title:string};
export async function discoverCampaignTwitch(input:{accessToken:string;clientId:string;broadcasterId:string;start:string;end:string},fetcher:typeof fetch=fetch):Promise<DiscoveredCampaignItem[]>{
 if(!input.accessToken||!input.clientId||!/^[1-9]\d{0,19}$/.test(input.broadcasterId)||!Number.isFinite(Date.parse(input.start))||!Number.isFinite(Date.parse(input.end))||Date.parse(input.end)<=Date.parse(input.start)||Date.parse(input.end)-Date.parse(input.start)>31*86400000)throw new CampaignSourceError('invalid_response');
 try{return await withBotUpstream(async bounded=>{
  const request=async(url:string,token=false):Promise<Record<string,unknown>>=>{
   const r=await bounded(url,{headers:token?{Authorization:`OAuth ${input.accessToken}`}:{Authorization:`Bearer ${input.accessToken}`,'Client-Id':input.clientId},redirect:'error',cache:'no-store'});
   if(r.status===401||r.status===403)throw new CampaignSourceError('token_invalid');if(r.status===429)throw new CampaignSourceError('rate_limited');if(!r.ok)throw new CampaignSourceError('unavailable');
   const reader=r.body?.getReader();if(!reader)throw new CampaignSourceError('invalid_response');
   const parts:Uint8Array[]=[];let size=0;
   while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>262144){void reader.cancel();throw new CampaignSourceError('invalid_response');}parts.push(next.value);}
   const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}
   const data:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw new CampaignSourceError('invalid_response');return data as Record<string,unknown>;
  };
  const validate=async()=>{const token=await request('https://id.twitch.tv/oauth2/validate',true);if(token.client_id!==input.clientId||token.user_id!==input.broadcasterId||typeof token.expires_in!=='number'||token.expires_in<=0)throw new CampaignSourceError('identity_mismatch');};
  await validate();const items:DiscoveredCampaignItem[]=[];
  for(const kind of ['video','clip'] as const){
   const query=new URLSearchParams(kind==='video'?{user_id:input.broadcasterId,first:'10',sort:'time'}:{broadcaster_id:input.broadcasterId,first:'10',started_at:input.start,ended_at:input.end});
   const response=await request(`https://api.twitch.tv/helix/${kind==='video'?'videos':'clips'}?${query}`);
   if(!Array.isArray(response.data)||response.data.length>10)throw new CampaignSourceError('invalid_response');
   for(const raw of response.data){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new CampaignSourceError('invalid_response');const row=raw as Record<string,unknown>;
    if(row[kind==='video'?'user_id':'broadcaster_id']!==input.broadcasterId)throw new CampaignSourceError('identity_mismatch');
    if(typeof row.id!=='string'||!(kind==='video'?/^\d{1,30}$/:/^[A-Za-z0-9_-]{1,100}$/).test(row.id)||typeof row.title!=='string'||typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at)))throw new CampaignSourceError('invalid_response');
    const when=Date.parse(row.created_at);if(when<Date.parse(input.start)||when>=Date.parse(input.end))continue;
    items.push({kind,external_id:`${kind}:${row.id}`,url:kind==='video'?`https://www.twitch.tv/videos/${row.id}`:`https://clips.twitch.tv/${row.id}`,title:row.title.slice(0,160)});
   }
  }
  await validate();if(new Set(items.map(i=>i.external_id)).size!==items.length)throw new CampaignSourceError('invalid_response');return items;
 },{fetcher,timeoutMs:15000});}catch(error){if(error instanceof CampaignSourceError)throw error;throw new CampaignSourceError('network');}
}
