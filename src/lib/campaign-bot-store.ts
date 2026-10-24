import 'server-only';
import { createBotStore } from './bot-api-store';
import type { createAdminClient } from './supabase/admin';
import type { CampaignBotStore, OwnBotCampaign } from './campaign-bot-api';

export function createCampaignBotStore(admin: ReturnType<typeof createAdminClient>): CampaignBotStore {
  const accounts = createBotStore(admin);
  return {
    findAccount: accounts.findAccount,
    findMembership: accounts.findMembership,
    async campaigns(organization, discord, expectedUser, offset, pilot, real) {
      const result = await admin.rpc('f5_bot_own_campaigns', { p_organization_id: organization, p_discord_id: discord,
        p_expected_user_id: expectedUser, p_offset: offset, p_include_pilot: pilot, p_include_real: real });
      if (result.error || !result.data || result.data.error || !Array.isArray(result.data.campaigns)) throw Error('campaigns_unavailable');
      return result.data.campaigns as OwnBotCampaign[];
    },
  };
}
