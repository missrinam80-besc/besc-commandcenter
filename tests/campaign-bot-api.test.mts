import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCampaignBotRequest, type CampaignBotStore } from '../src/lib/campaign-bot-api.ts';
import { hashBotKey, BotRateLimiter, parseBotClients, type BotClient } from '../src/lib/bot-api.ts';
const org = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222';
const guild = '111111111111111111', discord = '222222222222222222', key = `bb_fixture-campaign.${'a'.repeat(43)}`;
function fixture() {
  const client: BotClient = { id: 'fixture-campaign', keyHash: hashBotKey(key), organizationId: org, guildId: guild,
    scopes: ['campaigns:own:read'], expiresAt: '2099-01-01', revoked: false };
  let reads = 0, accounts = 0, enabled = true, swapped = false, withdrawn = false;
  const store: CampaignBotStore = {
    async findAccount() { accounts++; return { userId: swapped && accounts > 1 ? org : user, verifiedDiscordId: discord, banned: false }; },
    async findMembership() { return { organization_id: org, status: 'active', role: 'member', finance_role: 'none' }; },
    async campaigns(o,d,u,n,pilot,real) { assert.deepEqual([o,d,u,n,pilot,real],[org,discord,user,0,true,false]); reads++;
      return withdrawn && reads > 1 ? [] : Array.from({ length: 6 }, (_,n) => ({ id: `30000000-0000-4000-8000-${String(n).padStart(12,'0')}`, title: 'TESTFIXTURE campaign', synthetic: true, secret: 'hidden' })); },
  };
  const run = (query = `guild_id=${guild}&discord_user_id=${discord}`, method = 'GET', token = key) => handleCampaignBotRequest(new Request(`https://example.invalid/api/v1/bot/campaigns?${query}`, { method, headers: { authorization: `Bearer ${token}` } }), {
    enabled, pilot: true, real: false, clients: () => [client], store: () => store, limiter: new BotRateLimiter(),
  });
  return { client, store, run, reads: () => reads, off: () => { enabled=false; }, swap: () => { swapped=true; }, withdraw: () => { withdrawn=true; } };
}
test('Disabled campaign route never reads even malformed registry or constructs store', async () => {
  const denied = () => { throw Error('must not touch'); };
  const r = await handleCampaignBotRequest(new Request('https://example.invalid'), { enabled:false, pilot:true, real:true, clients:denied, store:denied });
  assert.equal(r.status,404); assert.equal(r.headers.get('cache-control'),'no-store');
});
test('Own campaign projection, pagination and fresh read after identity check', async () => {
  const f=fixture(), r=await f.run(), data=await r.json();
  assert.equal(r.status,200); assert.equal(data.schemaVersion,1); assert.equal(data.campaigns.length,5); assert.equal(data.nextOffset,5);
  assert.equal(f.reads(),2); assert.equal(JSON.stringify(data).includes('secret'),false);
  assert.deepEqual(Object.keys(data.campaigns[0]).sort(),['id','path','synthetic','title']);
});
test('Changed identity and withdrawal during upstream reads cannot disclose initial rows', async () => {
  const changed=fixture(); changed.swap(); assert.equal((await changed.run()).status,404); assert.equal(changed.reads(),1);
  const withdrawn=fixture(); withdrawn.withdraw(); assert.deepEqual((await(await withdrawn.run()).json()).campaigns,[]);
});
test('Existing token does not gain campaign scope; invalid, revoked and expired clients fail closed', async () => {
  for (const mode of ['scope','revoked','expired','wrong']) {
    const f=fixture(); if(mode==='scope')f.client.scopes=['identity:read'];if(mode==='revoked')f.client.revoked=true;if(mode==='expired')f.client.expiresAt='2000-01-01';
    assert([401,403].includes((await f.run(undefined,'GET',mode==='wrong'?'bad':key)).status));assert.equal(f.reads(),0);
  }
  const f=fixture(); assert.deepEqual(parseBotClients(JSON.stringify([f.client]))[0].scopes,['campaigns:own:read']);
});
test('No actor/organization overrides, duplicate parameters, wrong guild, invalid offset or writes', async () => {
  for(const query of [`guild_id=${guild}&discord_user_id=${discord}&organization_id=${org}`,`guild_id=${guild}&discord_user_id=${discord}&offset=99976`,
    `guild_id=${guild}&guild_id=${guild}`,`guild_id=333333333333333333&discord_user_id=${discord}`,`guild_id=${guild}&discord_user_id=bad`]) {
    const f=fixture(); assert([400,403].includes((await f.run(query)).status)); assert.equal(f.reads(),0);
  }
  const f=fixture();assert.equal((await f.run(undefined,'POST')).status,405);assert.equal(f.reads(),0);
});
