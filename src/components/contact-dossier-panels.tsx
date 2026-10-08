import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecordMetadata } from "@/components/record-metadata";
import { MarkdownContent } from "@/components/markdown-field";
import { RecordConnectionsPanel } from "@/components/record-connections-panel";
import { CommunitySections, PartnerSections } from "@/components/operational-sections";
import { ApprovalPanel } from "@/components/approval-panel";
import { SponsorDocumentTools } from "@/components/sponsor-document-tools";
import { communityRoleLabels } from "@/lib/community-people";
import { organizationRoleLabels, financeRoleLabels } from "@/lib/permissions";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import type { loadDossierConnections, loadRelationOptions } from "@/lib/dossier-relations";

type Row={id:string;[key:string]:unknown};
const statusLabels:Record<string,string>={pending:"In afwachting",active:"Actief",suspended:"Geschorst",revoked:"Ingetrokken",not_started:"Niet gestart",in_progress:"Bezig",completed:"Afgerond",not_required:"Niet nodig",planned:"Gepland",confirmed:"Bevestigd",cancelled:"Geannuleerd",todo:"Te doen",doing:"Bezig",waiting:"Wachten",review:"Review",done:"Afgerond"};
const text=(value:unknown)=>value===null||value===undefined||value===""?"Niet ingevuld":String(value);
const tags=(value:unknown)=>Array.isArray(value)&&value.length?value.join(", "):"Niet ingevuld";
function Card({title,children}:{title:string;children:React.ReactNode}) {return <section className="form-card"><div className="form-heading"><h2>{title}</h2></div>{children}</section>;}
function Notes({value}:{value:unknown}) {return value?<MarkdownContent>{String(value)}</MarkdownContent>:<p className="empty-inline">Nog geen notities.</p>;}

export async function ContactDossierPanels({module,tab,record,org,supabase,canManage,isAdmin,query,connections,options,accounts,accountError,loadError,roles,contacts,interactions,onboarding,assignments,events,projects,campaigns,people}: {
  module:"sponsors"|"community";tab:string;record:Row;org:string;supabase:SupabaseClient;canManage:boolean;isAdmin:boolean;
  query:Record<string,string|undefined>;connections:Awaited<ReturnType<typeof loadDossierConnections>>;options:Awaited<ReturnType<typeof loadRelationOptions>>;
  accounts:{id:string;label:string;status?:string;role?:string;finance_role?:string}[];accountError:boolean;loadError:boolean;roles:string[];
  contacts:Row[];interactions:Row[];onboarding:Row[];assignments:Row[];events:Row[];projects:Row[];campaigns:Row[];people:Row[];
}) {
  if(loadError) return <p className="error-note" role="alert">Dit onderdeel kon niet volledig geladen worden. Vernieuw de pagina voordat je wijzigingen uitvoert.</p>;
  const id=record.id;
  const entityType=module==="sponsors"?"partner":"community_person";
  const editHref=`?tab=${tab}&bewerken=1`;
  const links=<RecordConnectionsPanel entityType={entityType} entityId={id} {...connections} options={options} canManage={canManage} queryContext={`tab=${tab}`} view={tab==="dossiers"?"relationships":"documents"} modal={query.koppeling} selectedLinkId={query.link}/>;
  if(tab==="documenten") return <>
    <Card title="Documenten en bronnen">{record.drive_url?<a href={String(record.drive_url)} target="_blank" rel="noreferrer">Drive-map openen</a>:<p className="empty-inline">Nog geen Drive-map gekoppeld.</p>}{module==="sponsors"&&record.contract_url?<p><a href={String(record.contract_url)} target="_blank" rel="noreferrer">Contract openen</a></p>:null}</Card>
    {links}{module==="sponsors"?<><Link href={`/app/rapportage/sponsors/${id}`}>Sponsorrapportage openen</Link><SponsorDocumentTools partnerId={id}/></>:roles.includes("streamteam")?<Link href={`/app/rapportage/creators/${id}`}>Streamerrapportage openen</Link>:null}
  </>;
  if(module==="sponsors") {
    if(tab==="contacten"||tab==="opvolging") return <>
      {tab==="opvolging"&&<Card title="Volgende opvolging"><RecordMetadata items={[{label:"Datum",value:formatDate(record.next_follow_up as string|null)}]}/><Notes value={record.notes}/></Card>}
      <PartnerSections id={id} contacts={contacts} interactions={interactions} campaigns={campaigns} events={[]} content={[]} accountOptions={accounts} people={people} canManage={canManage} optionsError={accountError} section={tab}/>
    </>;
    if(tab==="samenwerking") return <><Card title="Samenwerking"><RecordMetadata items={[{label:"Samenwerkingstype",value:text(record.collaboration_type)},{label:"Geschatte waarde",value:record.estimated_value==null?"Niet bepaald":formatCurrency(record.estimated_value as number)}]}/><Notes value={record.agreement_summary}/></Card><ApprovalPanel entityType="partner" entityId={id} sourceHref={`/app/sponsors/${id}`} title="Sponsorafspraak goedkeuren"/></>;
    if(tab==="dossiers") {
      const content=await supabase.from("content_items").select("id,title,status").eq("organization_id",org).eq("partner_id",id).is("deleted_at",null).order("title");
      return <><Card title={`Campagnes (${campaigns.length})`}><div className="relation-list">{campaigns.map(c=><article key={c.id}><Link href={`/app/campagnes/${c.id}`}>{String(c.title)}</Link></article>)}{!campaigns.length&&<p className="empty-inline">Nog geen campagnes.</p>}</div></Card><Card title={`Content (${content.data?.length??0})`}>{content.error?<p role="alert">Content kon niet geladen worden.</p>:<div className="relation-list">{content.data.map(c=><article key={c.id}><Link href={`/app/content/${c.id}`}>{c.title}</Link></article>)}{!content.data.length&&<p className="empty-inline">Nog geen content.</p>}</div>}</Card>{links}</>;
    }
    const primary=contacts.find(c=>c.is_primary);
    const central=people.find(p=>p.id===primary?.community_person_id);
    return <><Card title="Bedrijfsgegevens"><RecordMetadata items={[{label:"Bedrijfsnaam",value:text(record.name)},{label:"Algemeen e-mailadres",value:text(record.email)},{label:"Website",value:record.website?<a href={String(record.website)} target="_blank" rel="noreferrer">{String(record.website)}</a>:"Niet ingevuld"},{label:"Sector",value:text(record.sector)}]}/></Card><Card title="Aanspreekpunt en opvolging"><RecordMetadata items={[{label:"Primair contact",value:primary?<Link href="?tab=contacten">{text(central?.display_name??primary.name)}</Link>:"Niet gekozen"},{label:"Volgende opvolging",value:<Link href="?tab=opvolging">{formatDate(record.next_follow_up as string|null)}</Link>} ]}/></Card><Card title="Beschrijving en notities"><Notes value={record.notes}/></Card></>;
  }
  if(tab==="profiel") return <Card title="Profiel en inzetbaarheid"><RecordMetadata items={[{label:"Contactrollen binnen BESC",value:roles.length?roles.map(r=>communityRoleLabels[r as keyof typeof communityRoleLabels]??r).join(", "):"Geen rollen"},{label:"Vaardigheden",value:tags(record.skills)},{label:"Interesses",value:tags(record.interests)},{label:"Beschikbaarheid",value:text(record.availability)},{label:"Platformen",value:tags(record.platforms)},{label:"Streamteamniveau",value:text(record.streamteam_level)}]}/></Card>;
  if(tab==="intake") return <><Card title="Intakevoortgang"><RecordMetadata items={[{label:"Intakefase",value:({candidate:"Kandidaat",onboarding:"Onboarding",tryout:"Try-out",active:"Actief",paused:"Pauze",inactive:"Inactief",rejected:"Afgewezen",archived:"Gearchiveerd"} as Record<string,string>)[String(record.status)]??text(record.status)},{label:"Onboarding",value:statusLabels[String(record.onboarding_status)]??"Niet gestart"},{label:"Checklist",value:`${onboarding.filter(o=>o.completed).length} van ${onboarding.length} afgerond`} ]}/></Card><CommunitySections id={id} onboarding={onboarding} assignments={assignments} events={events} projects={projects} section="intake" canManage={canManage}/></>;
  if(tab==="account") {
    const account=accounts.find(a=>a.id===record.account_user_id);
    const portal=record.account_user_id&&isAdmin?await supabase.from("portal_access").select("id,access_type,status").eq("organization_id",org).eq("user_id",String(record.account_user_id)):null;
    return <><Card title="Accountkoppeling"><RecordMetadata items={[{label:"Gebruikersaccount",value:account?.label??(record.account_user_id?"Eerder gekoppeld account":"Niet gekoppeld")},{label:"Accountstatus",value:accountError?"Niet beschikbaar":statusLabels[account?.status??""]??(record.account_user_id?"Niet beschikbaar":"Geen account")},{label:"Approl",value:account?.role?organizationRoleLabels[account.role as keyof typeof organizationRoleLabels]??account.role:"Niet beschikbaar"},{label:"Bestuursfuncties",value:account?.finance_role?financeRoleLabels[account.finance_role as keyof typeof financeRoleLabels]??account.finance_role:"Niet beschikbaar"}]}/>{canManage&&<Link className="secondary-button" href={editHref}>Accountkoppeling wijzigen</Link>}<p className="form-help">De contactstatus en contactrollen verlenen geen app- of portaaltoegang.</p>{isAdmin&&<Link href="/app/beheer/gebruikers">Rechten en portaaltoegang beheren</Link>}</Card><Card title="Portaaltoegang">{!isAdmin?<p>Alleen Admin kan portaaltoekenningen bekijken en beheren.</p>:portal?.error?<p role="alert">Portaaltoegang kon niet geladen worden.</p>:portal?.data?.length?<div className="relation-list">{portal.data.map(a=><article key={a.id}><strong>{a.access_type==="sponsor"?"Sponsorportaal":"Streamteamportaal"}</strong><span>{statusLabels[a.status]??a.status}</span></article>)}</div>:<p className="empty-inline">Geen portaaltoekenningen.</p>}</Card></>;
  }
  if(tab==="dossiers") {
    const [sponsors,tasks]=await Promise.all([
      supabase.from("partner_contacts").select("id,role_title,is_primary,partners(id,name,deleted_at)").eq("organization_id",org).eq("community_person_id",id),
      record.account_user_id?supabase.from("tasks").select("id,title,status,due_at").eq("organization_id",org).eq("assignee_id",String(record.account_user_id)).is("deleted_at",null).order("due_at"):Promise.resolve({data:[],error:null}),
    ]);
    const companies=(sponsors.data??[]).flatMap(c=>{const p=c.partners as unknown as Row|null;return p&&!p.deleted_at?[{...c,company:p}]:[];});
    return <><CommunitySections id={id} onboarding={onboarding} assignments={assignments} events={events} projects={projects} section="inzet" canManage={canManage}/><Card title="Sponsorbedrijven">{sponsors.error?<p role="alert">Sponsorrelaties konden niet geladen worden.</p>:<div className="relation-list">{companies.map(c=><article key={c.id}><Link href={`/app/sponsors/${c.company.id}?tab=contacten`}>{String(c.company.name)}</Link><span>{text(c.role_title)}{c.is_primary?" · Primair aanspreekpunt":""}</span></article>)}{!companies.length&&<p className="empty-inline">Nog geen sponsorbedrijven gekoppeld.</p>}</div>}</Card><Card title="Toegewezen taken">{tasks.error?<p role="alert">Taken konden niet geladen worden.</p>:<div className="relation-list">{tasks.data.map(t=><article key={t.id}><Link href={`/app/taken/${t.id}`}>{t.title}</Link><span>{statusLabels[t.status]??t.status} · {formatDateTime(t.due_at)}</span></article>)}{!tasks.data.length&&<p className="empty-inline">Nog geen toegewezen taken.</p>}</div>}</Card>{links}</>;
  }
  return <><div className="contact-summary-badges"><Link href="?tab=profiel">{roles.length?roles.map(r=>communityRoleLabels[r as keyof typeof communityRoleLabels]??r).join(" · "):"Nog geen contactrollen"}</Link><Link href="?tab=intake">Onboarding: {statusLabels[String(record.onboarding_status)]??"Niet gestart"}</Link><Link href="?tab=account">{record.account_user_id?"Account gekoppeld":"Geen account"}</Link></div><Card title="Contactgegevens"><RecordMetadata items={[{label:"Naam",value:text(record.display_name)},{label:"Handle",value:text(record.handle)},{label:"E-mail",value:text(record.email)},{label:"Discord",value:text(record.discord_handle)},{label:"Taal",value:text(record.language)}]}/></Card><Card title="Profielnotities"><Notes value={record.notes}/></Card></>;
}
