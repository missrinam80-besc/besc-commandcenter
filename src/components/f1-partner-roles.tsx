import Link from 'next/link';
import { requireActiveMembership } from '@/lib/auth-context';
import { partnerRoleLabels } from '@/lib/f1-workflows';
export async function F1PartnerRoles({partnerId}:{partnerId:string}){
 const {supabase,membership}=await requireActiveMembership();
 const {data,error}=await supabase.from('partner_roles').select('id,role,valid_from,valid_until,revoked_at').eq('organization_id',membership.organization_id).eq('partner_id',partnerId).order('valid_from',{ascending:false});
 return <section className="form-card"><h2>Bevestigde partnerrollen</h2>{error?<p>De rollenlijst is nog niet beschikbaar in deze omgeving.</p>:!data?.length?<p>Nog geen expliciete rol bevestigd. De bestaande hoofdclassificatie is historische administratie.</p>:data.map(r=><p key={r.id}><strong>{partnerRoleLabels[r.role as keyof typeof partnerRoleLabels]}</strong> · {r.valid_from} — {r.valid_until??'onbepaald'}{r.revoked_at?' · beëindigd':''}</p>)}<p><Link href="/app/administratie/werkstromen#partners">Rollen en bijdragen behandelen</Link></p><small>Een rol geeft geen extra portaal- of financiële toegang.</small></section>;
}
