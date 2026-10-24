import { randomUUID } from 'node:crypto';
import { authenticateBotClient, BotRateLimiter, type BotClient, type BotStore } from './bot-api.ts';

export type OwnBotCampaign = { id: string; title: string; synthetic: boolean };
export interface CampaignBotStore extends Pick<BotStore, 'findAccount' | 'findMembership'> {
  campaigns(organization: string, discord: string, expectedUser: string, offset: number, pilot: boolean, real: boolean): Promise<OwnBotCampaign[]>;
}
const limiter = new BotRateLimiter();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function campaignBotDisabled() {
  return Response.json({ error: { code: 'not_found' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
class Failure extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}
export async function handleCampaignBotRequest(request: Request, deps: {
  enabled: boolean; pilot: boolean; real: boolean;
  clients: () => BotClient[]; store: () => CampaignBotStore; limiter?: BotRateLimiter;
  audit?: (entry: { requestId: string; clientId: string | null; status: number; code: string }) => void;
}) {
  // No client registry parsing or store construction while disabled.
  if (!deps.enabled) return campaignBotDisabled();
  const requestId = randomUUID(); let clientId: string | null = null;
  const reply = (status: number, value: object, code = 'ok') => {
    try { deps.audit?.({ requestId, clientId, status, code }); } catch { /* audit is isolated */ }
    return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId, ...(status === 405 ? { Allow: 'GET' } : {}), ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
  };
  try {
    if (request.method !== 'GET') throw new Failure(405, 'method_not_allowed');
    const client = authenticateBotClient(request, deps.clients());
    if (!client) throw new Failure(401, 'invalid_client');
    clientId = client.id;
    if (!(deps.limiter ?? limiter).allow(client.id, Date.now())) throw new Failure(429, 'rate_limited');
    if (!client.scopes.includes('campaigns:own:read')) throw new Failure(403, 'insufficient_scope');
    const url = new URL(request.url);
    for (const key of url.searchParams.keys()) if (!['guild_id', 'discord_user_id', 'offset'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Failure(400, 'invalid_query');
    if (url.searchParams.get('guild_id') !== client.guildId) throw new Failure(403, 'guild_not_allowed');
    const discord = url.searchParams.get('discord_user_id') ?? '', rawOffset = url.searchParams.get('offset') ?? '0';
    if (!/^[1-9]\d{16,19}$/.test(discord)) throw new Failure(400, 'invalid_discord_id');
    if (!/^(0|[1-9]\d{0,4})$/.test(rawOffset) || Number(rawOffset) > 99975) throw new Failure(400, 'invalid_offset');
    const store = deps.store();
    const account = async (expected?: string) => {
      const value = await store.findAccount(discord);
      if (!value || value.banned || value.verifiedDiscordId !== discord || (expected && value.userId !== expected)) throw new Failure(404, 'account_unavailable');
      const member = await store.findMembership(value.userId, client.organizationId);
      if (!member || member.organization_id !== client.organizationId || member.status !== 'active' || !['admin', 'board', 'member', 'volunteer'].includes(member.role)) throw new Failure(403, 'membership_required');
      return value.userId;
    };
    const user = await account();
    const read = () => store.campaigns(client.organizationId, discord, user, Number(rawOffset), deps.pilot, deps.real);
    await read(); // Authorization and source read before final identity recheck.
    await account(user);
    const rows = await read(); // Re-evaluate campaign/consent after upstream identity requests.
    if (!Array.isArray(rows) || rows.length > 6 || rows.some(row => typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 160 || typeof row.synthetic !== 'boolean' || (row.synthetic ? !deps.pilot : !deps.real))) throw Error('invalid_upstream');
    const campaigns = rows.slice(0, 5).map(row => ({ id: row.id, title: row.title, synthetic: row.synthetic, path: `/app/campagnes/${row.id}/proef` }));
    const offset = Number(rawOffset);
    return reply(200, { schemaVersion: 1, campaigns, nextOffset: rows.length > 5 && offset + 5 <= 99975 ? offset + 5 : null });
  } catch (error) {
    const failure = error instanceof Failure ? error : new Failure(503, 'upstream_unavailable');
    return reply(failure.status, { error: { code: failure.message, requestId } }, failure.message);
  }
}
