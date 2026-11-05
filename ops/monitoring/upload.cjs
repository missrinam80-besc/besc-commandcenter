(async()=>{
 const fs=await import('node:fs');
 const packet=JSON.parse(fs.readFileSync(0,'utf8'));
 const url=process.env.SUPABASE_URL_SERVER||process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!url||!process.env.SUPABASE_SECRET_KEY)throw Error('missing_configuration');
 const secret=process.env.SUPABASE_SECRET_KEY;
 const origin=new URL(url);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash)throw Error('invalid_origin');
 const rpc=async(name,args)=>{
  const response=await fetch(new URL('/rest/v1/rpc/'+name,origin),{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(7000),redirect:'error'});
  if(!response.ok)throw Error('rpc_failed');const data=await response.json();return {data,error:null};
 };
 const write=async(target,snapshot,observed=packet.observed_at)=>{const r=await rpc('ops_record_snapshot',{p_organization_id:packet.organization_id,p_target:target,p_observed_at:observed,p_snapshot:snapshot});if(r.error)throw Error('snapshot_upload_failed');return r.data;};
 const result=[await write(packet.target,packet.snapshot)];
 if(packet.target==='web'){
  const metrics=await rpc('ops_database_snapshot',{p_organization_id:packet.organization_id});if(metrics.error)throw Error('database_metrics_failed');
  result.push(await write('database',metrics.data));
  if(packet.bot){if(packet.bot.target!=='bot'||packet.bot.organization_id!==packet.organization_id)throw Error('invalid_bot_packet');result.push(await write('bot',packet.bot.snapshot,packet.bot.observed_at));}
 }
 console.log(JSON.stringify({uploaded:true,targets:result.map(x=>({target:x.target,status:x.status}))}));
})().catch(()=>{console.error('OP01: upload niet geslaagd; controleer lokale status en verbinding.');process.exit(1);});
