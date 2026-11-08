import {requireActiveMembership} from '@/lib/auth-context';
import {manageInstagramPublication} from '@/app/app/social/instagram-actions';
import {formatDateTime} from '@/lib/format';

type Row={id:string;state:string;scheduled_at:string;permalink:string|null;reason:string|null;events:{operation:string;created_at:string}[]};
const labels:Record<string,string>={scheduled:'Vrijgegeven voor planning',preparing:'Verwerking gestart',container_ready:'Afbeelding ontvangen door Instagram',publishing:'Publicatie aangevraagd',published:'Gepubliceerd',failed:'Controle mislukt',uncertain:'Uitkomst onzeker — opvolging nodig',cancelled:'Geannuleerd'};
const events:Record<string,string>={queued:'Publicatie klaargezet',cancelled:'Planning geannuleerd',blocked:'Gewijzigde inhoud of toegang blokkeert publicatie',preflight_failed:'Controle vóór publicatie mislukt',claimed:'Verwerking gestart',created:'Afbeelding ontvangen door Instagram',dispatch_publish:'Publicatie aangevraagd',complete:'Publicatie bevestigd',uncertain:'Externe uitkomst niet bevestigd'};
export async function InstagramPublicationPanel({id}:{id:string}){
 if(process.env.BESC_INSTAGRAM_PUBLICATION_ENABLED!=='true')return null;
 const {supabase,membership}=await requireActiveMembership();if(!['admin','board'].includes(membership.role))return null;
 const [{data:post,error:postError},{data:accounts,error:accountError},{data:jobs,error:jobError}]=await Promise.all([
  supabase.from('social_posts').select('platform,bundle_kind,post_type,status,scheduled_at,instagram_image_url,instagram_account_id').eq('organization_id',membership.organization_id).eq('id',id).is('deleted_at',null).maybeSingle(),
  supabase.from('social_accounts').select('id,account_name').eq('organization_id',membership.organization_id).eq('platform','instagram').eq('status','connected').is('deleted_at',null),
  supabase.rpc('instagram_publication_owner',{p_org:membership.organization_id,p_post:id,p_action:'list'}),
 ]);
 if(postError||accountError||jobError||!post)return <section className="form-card"><h2>Instagram-publicatie</h2><p className="error-note">De publicatiegegevens konden niet worden gecontroleerd. Er is niets vrijgegeven.</p></section>;
 if(post.platform!=='Instagram'||post.bundle_kind!=='single'||post.post_type!=='publication')return <section className="form-card"><h2>Instagram-publicatie</h2><p>Deze eerste keten ondersteunt één Instagram-bericht met één JPEG-afbeelding. Stories, reels, carrousels en kanaalbundels volgen afzonderlijk.</p></section>;
 const history=(jobs??[]) as Row[],canChange=!history.some(j=>['preparing','container_ready','publishing','uncertain'].includes(j.state))&&post.status!=='review';
 return <section className="form-card"><h2>Instagram-publicatie</h2>
  <p>Tekst, afbeelding, account en tijdstip worden samen beoordeeld. Vrijgeven zet de goedgekeurde versie klaar voor publicatie; een tijdstip in het verleden is direct aan de beurt.</p>
  <p>Afbeelding: {post.instagram_image_url?<a href={post.instagram_image_url} target="_blank" rel="noreferrer">Bekijk de gekozen JPEG</a>:'Nog geen afbeelding gekozen'}</p>
  {canChange&&membership.role==='admin'&&<form action={manageInstagramPublication}><input type="hidden" name="post" value={id}/><input type="hidden" name="action" value="image"/>
   <label>Instagram-account<select name="account" defaultValue={post.instagram_account_id??''} required><option value="">Kies een account</option>{(accounts??[]).map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select></label>
   <label>JPEG-link uit de ingestelde BESC-mediaopslag<input type="url" name="image_url" required defaultValue={post.instagram_image_url??''}/></label>
   <p className="form-hint">Een Canva-ontwerplink is geen publicatieafbeelding. De afbeelding wordt gecontroleerd. Een wijziging vraagt opnieuw beoordeling.</p><button>Afbeelding en account bewaren</button></form>}
  {['approved','scheduled'].includes(post.status)&&post.instagram_image_url&&post.scheduled_at&&!history.some(j=>!['cancelled','failed'].includes(j.state))&&<form action={manageInstagramPublication}>
   <input type="hidden" name="post" value={id}/><input type="hidden" name="action" value="queue"/>
   <p>Gepland: {formatDateTime(post.scheduled_at)}</p><label><input type="checkbox" name="confirm" value="yes" required/>Deze goedgekeurde versie mag op het ingestelde tijdstip op het gekozen Instagram-account worden gepubliceerd.</label><button>Publicatie vrijgeven</button></form>}
  {history.map(job=><article key={job.id}><h3>{labels[job.state]??'Opvolging nodig'}</h3><p>Gepland: {formatDateTime(job.scheduled_at)}</p>
   {job.state==='uncertain'&&<p className="error-note">Het bericht kan al op Instagram staan. Maak geen nieuwe publicatie om deze aanvraag te herhalen; laat eerst de externe uitkomst controleren.</p>}
   {job.permalink&&/^https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/$/.test(job.permalink)&&<a href={job.permalink} target="_blank" rel="noreferrer">Open gepubliceerd bericht</a>}
   {job.state==='scheduled'&&<form action={manageInstagramPublication}><input type="hidden" name="post" value={id}/><input type="hidden" name="action" value="cancel"/><input type="hidden" name="job" value={job.id}/><button>Geplande publicatie annuleren</button></form>}
   <details><summary>Publicatiehistorie</summary>{job.events.map((event,index)=><p key={index}>{events[event.operation]??'Opvolging geregistreerd'} · {formatDateTime(event.created_at)}</p>)}</details>
  </article>)}
 </section>;
}
