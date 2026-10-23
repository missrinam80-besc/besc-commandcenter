// Pure adapter: fixed official endpoints, no discovery or arbitrary URL fetches.
export const twitchCampaignCapabilities = {
  video: { metric: 'views', definition: 'twitch.video.view_count.v1', semantics: 'cumulative' },
  clip: { metric: 'views', definition: 'twitch.clip.view_count.v1', semantics: 'cumulative' },
  channel: { metric: 'current_viewers', definition: 'twitch.stream.viewer_count.v1', semantics: 'instant' },
} as const;
type SourceErrorCode = 'token_invalid' | 'identity_mismatch' | 'rate_limited' | 'unavailable' | 'invalid_response' | 'network';
export class CampaignSourceError extends Error {
  code: SourceErrorCode;
  constructor(code: SourceErrorCode) { super(code); this.code = code; }
}
export type TwitchCampaignSample = { metric: string; definition: string; semantics: 'cumulative' | 'instant'; value: number | null; quality: 'known' | 'missing'; measured_at: string; period_start: string; period_end: string; source_reference: string };
export async function collectCampaignTwitch(input: { accessToken: string; clientId: string; broadcasterId: string; externalId: string }, fetcher: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<TwitchCampaignSample> {
  const match = /^(video|clip|channel):([A-Za-z0-9_-]{1,100})$/.exec(input.externalId);
  if (!match || !/^[1-9]\d{0,19}$/.test(input.broadcasterId) || !input.clientId || !input.accessToken) throw new CampaignSourceError('invalid_response');
  const kind = match[1] as keyof typeof twitchCampaignCapabilities, id = match[2];
  if (kind === 'video' && !/^\d{1,30}$/.test(id)) throw new CampaignSourceError('invalid_response');
  if (kind === 'channel' && !/^[a-z0-9_]{1,25}$/.test(id)) throw new CampaignSourceError('invalid_response');
  const request = async (url: string, validation = false): Promise<Record<string, unknown>> => {
    let response: Response;
    try { response = await fetcher(url, { headers: validation ? { Authorization: `OAuth ${input.accessToken}` } : { Authorization: `Bearer ${input.accessToken}`, 'Client-Id': input.clientId }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) }); }
    catch { throw new CampaignSourceError('network'); }
    if (response.status === 401 || response.status === 403) throw new CampaignSourceError('token_invalid');
    if (response.status === 429) throw new CampaignSourceError('rate_limited');
    if (!response.ok) throw new CampaignSourceError('unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new CampaignSourceError('invalid_response');
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 262144) { await reader.cancel(); throw new CampaignSourceError('invalid_response'); } chunks.push(chunk.value); } }
    catch (error) { if (error instanceof CampaignSourceError) throw error; throw new CampaignSourceError('network'); }
    try { const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; } const body: unknown = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error(); return body as Record<string, unknown>; }
    catch { throw new CampaignSourceError('invalid_response'); }
  };
  const validate = async () => {
    const token = await request('https://id.twitch.tv/oauth2/validate', true);
    if (token.client_id !== input.clientId || token.user_id !== input.broadcasterId || !Number.isFinite(token.expires_in) || Number(token.expires_in) <= 0) throw new CampaignSourceError('identity_mismatch');
    if (kind === 'channel' && String(token.login).toLowerCase() !== id) throw new CampaignSourceError('identity_mismatch');
  };
  await validate();
  const endpoint = kind === 'video' ? `videos?id=${encodeURIComponent(id)}` : kind === 'clip' ? `clips?id=${encodeURIComponent(id)}` : `streams?user_id=${input.broadcasterId}&first=1`;
  const body = await request(`https://api.twitch.tv/helix/${endpoint}`);
  if (!Array.isArray(body.data) || body.data.length > 1) throw new CampaignSourceError('invalid_response');
  const record = body.data[0] as Record<string, unknown> | undefined;
  if (record && (typeof record !== 'object' || record === null)) throw new CampaignSourceError('invalid_response');
  if (record && (kind === 'clip' ? record.broadcaster_id : record.user_id) !== input.broadcasterId) throw new CampaignSourceError('identity_mismatch');
  if (record && kind !== 'channel' && record.id !== id) throw new CampaignSourceError('identity_mismatch');
  if (record && kind === 'channel' && String(record.user_login).toLowerCase() !== id) throw new CampaignSourceError('identity_mismatch');
  const raw = kind === 'channel' ? record?.viewer_count : record?.view_count;
  // An offline channel is a known zero current-viewer snapshot. A missing VOD/clip
  // is not evidence of deletion and has no known view counter.
  const value = !record ? kind === 'channel' ? 0 : null : Number(raw);
  if (record && (typeof raw !== 'number' || !Number.isSafeInteger(value) || value! < 0 || value! >= 1e15)) throw new CampaignSourceError('invalid_response');
  await validate(); // revocation/identity changes during the request block commit
  const measured = now().toISOString(), capability = twitchCampaignCapabilities[kind];
  return { ...capability, value, quality: value === null ? 'missing' : 'known', measured_at: measured, period_start: new Date(Date.parse(measured) - 1).toISOString(), period_end: measured, source_reference: `Twitch Helix ${kind}; ${capability.definition}` };
}
