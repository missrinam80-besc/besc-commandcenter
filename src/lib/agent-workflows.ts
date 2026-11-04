import {z} from 'zod';

// Existing agents only: these keys select operator-confirmed IDs, never create agents.
export const agentCatalog = {
  technical: 'Technical', management: 'Management', project: 'Project', event: 'Event',
  content: 'Content', creative: 'Creative', reporting: 'Reporting', commerce: 'Commerce',
  finance_assets: 'Finance & Assets',
} as const;
// IDs from the existing in-place agent manifest; channel access is still verified separately.
export const existingAgentIds:Record<keyof typeof agentCatalog,string>={
 technical:'agt_6ac27fb6af208191a789d9e3ba077ef6',management:'agt_6ac21ea034048191906a3c309e255ec2',
 project:'agt_6ac16b1dc94481919b82e8ef17905f31',event:'agt_6ac2521609748191ae967ec5bb067871',
 content:'agt_6ac24b5a708081919fa460fa6746aa99',creative:'agt_6ac2675add148191a85978e8de3b0383',
 reporting:'agt_6ac273ee22708191aabac76eeca67b6c',commerce:'agt_6ac25de8662881918021da7236c6f102',
 finance_assets:'agt_6ac23b53241081919d7791dc8200241a',
};
export const agentKeys = Object.keys(agentCatalog) as (keyof typeof agentCatalog)[];
export type AgentKey = keyof typeof agentCatalog;
export const agentKeySchema = z.enum(['technical','management','project','event','content','creative','reporting','commerce','finance_assets']);
export const contextSections = ['description','schedule'] as const;
export const workflowInput = z.object({
  agent_key: agentKeySchema,
  context_sections: z.array(z.enum(contextSections)).max(2).refine(v=>new Set(v).size===v.length),
  context_excerpt: z.string().trim().max(6000).default(''),
  context_reference: z.string().trim().max(300).default(''),
  context_confirmed: z.boolean(),
}).refine(v=>!v.context_excerpt || Boolean(v.context_reference), {message:'Vermeld de bron van het geselecteerde fragment.'})
  .refine(v=>(!v.context_sections.length&&!v.context_excerpt)||v.context_confirmed, {message:'Controleer eerst de geselecteerde inhoud.'});

export function configuredAgent(key: AgentKey, env: Record<string,string|undefined>) {
  const prefix=`BESC_${key.toUpperCase()}_AGENT`;
  const agentId=env[`${prefix}_ID`]??existingAgentIds[key];
  const channelId=env[`${prefix}_CHANNEL_ID`]??'';
  const token=env.BESC_WORKSPACE_AGENT_ACCESS_TOKEN??'';
  if(agentId!==existingAgentIds[key]||!/^agt_[A-Za-z0-9_-]+$/.test(agentId)||!/^agtch_[A-Za-z0-9_-]+$/.test(channelId)||!token||token.length>8192||/[\r\n]/.test(token))return null;
  return {agentId,channelId,token};
}

export const providerStatuses = ['queued','in_progress','suspended','completed','failed'] as const;
export type ProviderStatus = typeof providerStatuses[number];
export const dispatchErrors = ['credential','permission','channel','not_runnable','rate_limited','provider_unavailable','network','timeout','receipt','unknown'] as const;
export type DispatchErrorCode = typeof dispatchErrors[number];
export const dispatchFeedback: Record<DispatchErrorCode,string> = {
  credential:'De agentdienst weigert het toegangstoken. Laat het token controleren of vervangen; maak geen nieuwe opdracht.',
  permission:'Het token heeft geen toegang tot dit agentkanaal. Controleer de bestaande workspace en kanaaltoegang.',
  channel:'Het agentkanaal is niet gevonden of niet toegankelijk. Controleer de kanaalkoppeling.',
  not_runnable:'Het agentkanaal kan nu geen opdracht aannemen. Controleer de publicatiestatus in ChatGPT.',
  rate_limited:'De agentdienst begrenst aanvragen. Wacht en controleer de bestaande opdracht voordat je opnieuw verzendt.',
  provider_unavailable:'De agentdienst is tijdelijk niet beschikbaar. Ontvangst kan onzeker zijn; maak geen nieuwe opdracht.',
  network:'De verbinding met de agentdienst kon niet worden bevestigd. Controleer eerst het bestaande agentgesprek.',
  timeout:'De agentdienst antwoordde niet op tijd. De opdracht kan wel ontvangen zijn; controleer eerst het bestaande agentgesprek.',
  receipt:'De ontvangstbevestiging kon niet worden verwerkt. Controleer het bestaande agentgesprek voordat je herhaalt.',
  unknown:'De ontvangst kon niet worden bevestigd. Controleer de bestaande opdracht; maak geen dubbele opdracht.',
};
export function sqlWorkflowFeedback(error: {message?:string}|null) {
  const m=error?.message??'';
  for(const [code,message] of Object.entries({
    agent_budget_required:'Keur eerst maximaal 5 credits goed en bevestig dat de externe kostenlimiet is gecontroleerd.',
    agent_attempt_limit:'Het maximum aantal verzendpogingen is bereikt. Bekijk het agentgesprek; start niet automatisch een nieuwe opdracht.',
    agent_paused:'Agentuitvoering is gepauzeerd. Er worden geen nieuwe verzendingen toegestaan.',
    agent_cancelled:'Deze opdracht is ingetrokken. CC accepteert geen nieuw resultaat; een al lopende provideruitvoering stopt hiermee niet automatisch.',
    agent_source_conflict:'Het brondossier is gewijzigd. Beoordeel de actuele gegevens voordat je een nieuwe opdracht voorbereidt.',
    agent_job_closed:'Deze opdracht is verlopen of heeft al een resultaat.',
    agent_dispatch_busy:'Een verzending wordt al verwerkt. Wacht en vernieuw de pagina.',
    agent_channel_conflict:'Het kanaal van deze opdracht is gewijzigd. Herstel eerst de oorspronkelijke koppeling.',
  })) if(m.includes(code))return message;
  return 'De handeling kon niet worden bevestigd. Controleer toegang, bronversie en actuele opdrachtgegevens.';
}

// Provider errors never contain raw response text, tokens, request headers or source data.
export class AgentDispatchError extends Error {
  readonly code:DispatchErrorCode;
  readonly status:number|null;
  constructor(code:DispatchErrorCode,status:number|null=null) {
    super(`agent_dispatch_${code}`); this.name='AgentDispatchError';this.code=code;this.status=status;
  }
}

export function selectedContext(record: Record<string,unknown>, sections: readonly string[], excerpt='', reference='') {
  const result: Record<string,unknown>={};
  if(sections.includes('description')) result.description=String(record.description??'').slice(0,6000);
  if(sections.includes('schedule')) result.schedule=Object.fromEntries(
    ['start_at','end_at','location','is_online','start_date','due_date'].filter(k=>k in record).map(k=>[k,record[k]]));
  if(excerpt)result.user_selected_excerpt={text:excerpt,reference,verification:'selected_by_requester_not_independently_verified'};
  return result;
}
