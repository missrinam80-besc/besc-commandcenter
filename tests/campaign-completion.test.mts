import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePilotPostUrl, pilotReport, pilotReportCsv, type PilotState, type PilotSelection, type PilotMeasurement } from '../src/lib/campaign-pilot.ts';
import { collectCampaignTwitch } from '../src/lib/campaign-twitch.ts';
const selection: PilotSelection = {metric:'views',definition:'views.v1',semantics:'period',first:{start:'2030-01-01T00:00:00Z',end:'2030-01-02T00:00:00Z'},second:{start:'2030-01-02T00:00:00Z',end:'2030-01-03T00:00:00Z'},asOf:'2030-01-04T00:00:00Z',freshnessHours:168,engagement:{numerator:'likes_comments',definition:'engagement.v1',denominator:'views',denominatorDefinition:'views.v1'}};
function fixture(): PilotState {
  const measurements: PilotMeasurement[] = [];
  for (const key of ['first','second'] as const) for (const [metric,value] of [['views',100],['likes',8],['comments',2]] as const) measurements.push({id:key+metric,contribution_id:'post',revision:1,metric,definition:metric==='views'?'views.v1':'engagement.v1',unit:'count',semantics:'period',period_start:selection[key].start,period_end:selection[key].end,measured_at:selection[key].end,fetched_at:'2030-01-03T00:00:00Z',value,quality:'known',source_kind:'export',source_reference:'Controlled reference'});
  return {synthetic:false,campaign_id:'campaign',chair:false,editor:false,reviewer:false,reader:true,policies:[],access:[],participants:[],posts:[{id:'post',participant_id:'person',platform:'twitch',external_id:'video:123',canonical_url:'https://www.twitch.tv/videos/123',revision:1,status:'verified',availability:'available',checked_at:null}],measurements};
}
test('Campaign completion: explicit engagement inputs, zero and missing never yield invented percentages', () => {
  const state=fixture(), report=pilotReport(state,selection);
  assert.equal(report.engagement!.windows[0].percent,10);
  assert(pilotReportCsv(report).includes('"10","100","10"'));
  state.measurements[0].value=0; assert.equal(pilotReport(state,selection).engagement!.windows[0].percent,null);
  state.measurements[0].value=100; state.measurements[1].quality='partial';assert.equal(pilotReport(state,selection).engagement!.windows[0].percent,null);
});
test('Campaign completion: cumulative Twitch snapshots are not period sums; resets are unknown', () => {
  const state=fixture();state.measurements=state.measurements.filter(m=>m.metric==='views').map((m,i)=>({...m,semantics:'cumulative',measured_at:new Date(Date.parse(selection[i?'second':'first'].start)+3600000).toISOString(),value:i?140:100}));
  const s={...selection,engagement:undefined,semantics:'cumulative' as const};const r=pilotReport(state,s);
  assert.equal(r.first.value,null);assert.equal(r.counterChanges[0].delta,40);
  state.measurements[1].value=1;assert.equal(pilotReport(state,s).counterChanges[0].delta,null);
});
test('Campaign completion: official and export benchmark retain separate provenance',()=>{
  const state=fixture();state.measurements.push({...state.measurements[0],id:'official',source_kind:'official_api',value:105});
  const report=pilotReport(state,{...selection,benchmark:'export'});assert.equal(report.benchmark![0].rows[0].difference,5);assert(pilotReportCsv(report).includes('benchmark'));
});
test('Campaign completion: canonical Twitch VOD, clip and channel; unsafe destinations rejected',()=>{
  assert.equal(parsePilotPostUrl('https://www.twitch.tv/videos/123?t=5s')?.externalId,'video:123');assert.equal(parsePilotPostUrl('https://clips.twitch.tv/Example-Slug')?.externalId,'clip:Example-Slug');assert.equal(parsePilotPostUrl('https://twitch.tv/EXAMPLE')?.externalId,'channel:example');
  for(const url of ['https://twitch.tv.evil.test/videos/123','https://twitch.tv/directory','https://twitch.tv@evil.test/example','https://127.0.0.1/example'])assert.equal(parsePilotPostUrl(url),null);
});
test('Campaign completion: Twitch validates before/after, binds owner and sanitizes token failures',async()=>{
  const urls:string[]=[];let validations=0;
  const mock:typeof fetch=async (url)=>{urls.push(String(url));if(String(url).includes('/validate')){validations++;return Response.json({client_id:'client',user_id:'123',expires_in:100});}return Response.json({data:[{id:'456',user_id:'123',view_count:42}]});};
  const sample=await collectCampaignTwitch({accessToken:'never-log-token',clientId:'client',broadcasterId:'123',externalId:'video:456'},mock);assert.equal(sample.value,42);assert.equal(sample.semantics,'cumulative');assert.equal(validations,2);assert.equal(urls.length,3);
  const revoked:typeof fetch=async url=>String(url).includes('/validate')?new Response('sensitive raw error',{status:401}):Response.json({data:[]});
  await assert.rejects(collectCampaignTwitch({accessToken:'never-log-token',clientId:'client',broadcasterId:'123',externalId:'video:456'},revoked),e=>e instanceof Error&&e.message==='token_invalid');
  let calls=0;
  const revokedDuringFetch:typeof fetch=async url=>String(url).includes('/validate') ? ++calls===2 ? new Response(null,{status:401}) : Response.json({client_id:'client',user_id:'123',expires_in:100}) : Response.json({data:[{id:'456',user_id:'123',view_count:42}]});
  await assert.rejects(collectCampaignTwitch({accessToken:'never-log-token',clientId:'client',broadcasterId:'123',externalId:'video:456'},revokedDuringFetch),/token_invalid/);
  const wrongOfflineChannel:typeof fetch=async()=>Response.json({client_id:'client',user_id:'123',login:'other',expires_in:100});
  await assert.rejects(collectCampaignTwitch({accessToken:'never-log-token',clientId:'client',broadcasterId:'123',externalId:'channel:example'},wrongOfflineChannel),/identity_mismatch/);
});
