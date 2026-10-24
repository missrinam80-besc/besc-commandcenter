import 'server-only';
import { createBotStore } from './bot-api-store';
import type { createAdminClient } from './supabase/admin';
import type { CampaignBotStore, OwnBotCampaign } from './campaign-bot-api';
import type { CampaignSubmitStore } from './campaign-bot-submit';

export function createCampaignBotStore(admin: ReturnType<typeof createAdminClient>): CampaignBotStore & CampaignSubmitStore {
  const accounts = createBotStore(admin);
  return {
    findAccount: accounts.findAccount,
    findMembership: accounts.findMembership,
    async submit(org,guild,discord,user,campaign,key,platform,external,pilot,real){
      const r=await admin.rpc('f5_bot_submit',{p_org:org,p_guild:guild,p_discord:discord,p_user:user,p_campaign:campaign,p_participant:null,p_key:key,p_platform:platform,p_external:external,p_pilot:pilot,p_real:real});
      if(r.error)throw Error(r.error.code==='23505'?'idempotency_conflict':r.error.code==='42501'?'campaign_unavailable':'upstream_unavailable');
      return r.data;
    },
    async campaigns(organization, discord, expectedUser, offset, pilot, real) {
      const result = await admin.rpc('f5_bot_own_campaigns', { p_organization_id: organization, p_discord_id: discord,
        p_expected_user_id: expectedUser, p_offset: offset, p_include_pilot: pilot, p_include_real: real });
      if (result.error || !result.data || result.data.error || !Array.isArray(result.data.campaigns)) throw Error('campaigns_unavailable');
      return result.data.campaigns as OwnBotCampaign[];
    },
  };
}
