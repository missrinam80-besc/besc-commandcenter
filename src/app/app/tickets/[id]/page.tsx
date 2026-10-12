import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth-context";
import { ticketStatuses, ticketLinkLabels, ticketDeliveryLabels, ticketErrors } from "@/lib/tickets";
import { updateTicket } from "../actions";

export default async function Ticket({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string,string|undefined>> }) {
  const { supabase, membership } = await requirePermission("manageTickets");
  const { id } = await params, query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await supabase.from("support_tickets").select("*").eq("organization_id",membership.organization_id).eq("id",id).maybeSingle();
  if (result.error) throw Error("ticket_read_unavailable");
  const ticket = result.data;
  if (!ticket) notFound();
  const messagePage = Math.min(1000,Math.max(1,Number.parseInt(query.pagina??"1",10)||1));
  const [messages, deliveries, candidates] = await Promise.all([
    supabase.from("support_ticket_messages").select("id,direction,content,created_at",{count:"exact"}).eq("organization_id",membership.organization_id).eq("ticket_id",id).order("created_at",{ascending:false}).order("id").range((messagePage-1)*50,messagePage*50-1),
    supabase.from("support_ticket_deliveries").select("id,state,kind,last_error").eq("organization_id",membership.organization_id).eq("ticket_id",id).order("sequence",{ascending:false}).limit(50),
    supabase.rpc("ticket_staff_candidates",{p_org:membership.organization_id}),
  ]);
  const messageIds = (messages.data ?? []).filter(m=>m.direction==='staff').map(m=>m.id);
  const messageDeliveries = messageIds.length ? await supabase.from("support_ticket_deliveries").select("message_id,state")
    .eq("organization_id",membership.organization_id).eq("ticket_id",id).in("message_id",messageIds).limit(50) : { data: [], error: null };
  const hidden = <><input type="hidden" name="ticket_id" value={id}/><input type="hidden" name="version" value={ticket.version}/></>;
  const snapshot = ticket.intake_snapshot as {name?:string;questions?:{id:string;label:string;options?:{value:string;label:string}[]}[]}|null;
  const intakeAnswers = ticket.intake_answers as Record<string,string|string[]>|null;
  const closed = ticket.status === "closed";
  return <AppShell active="Discordtickets"><header className="topbar module-top ticket-detail-top"><div><p>DISCORDTICKET</p><h1>{ticket.subject}</h1></div><Link className="secondary" href="/app/tickets">Alle tickets</Link></header>
    <div className="module-body ticket-layout">
      {query.fout && <p className="error-note" role="alert">{ticketErrors[query.fout] ?? ticketErrors.upstream_unavailable}</p>}
      {query.opgeslagen && <p className="ticket-success" role="status">Opgeslagen. Externe antwoorden worden afzonderlijk door Discord bevestigd.</p>}
      {(messages.error||deliveries.error||candidates.error||messageDeliveries.error) && <p className="error-note">Niet alle ticketgegevens konden worden geladen.</p>}
      <div className="ticket-detail-panels"><section className="panel ticket-treatment"><div className="ticket-section-heading"><div><span className="eyebrow">BEHANDELING</span><h2>Ticketgegevens</h2></div></div><span className={"ticket-status ticket-status-"+ticket.status}>{ticketStatuses[ticket.status as keyof typeof ticketStatuses]}</span><dl className="ticket-meta"><div><dt>Discordkoppeling</dt><dd>{ticketLinkLabels[ticket.link_status]}</dd></div><div><dt>Aanvrager op Discord</dt><dd>{ticket.requester_discord_id}</dd></div></dl>
      {ticket.thread_id && <a className="secondary" href={`https://discord.com/channels/${ticket.guild_id}/${ticket.thread_id}`} target="_blank" rel="noreferrer">Open privéthread</a>}
      {closed ? <p className="ticket-closed-note">Gesloten · verwijderen vanaf {new Date(ticket.purge_at).toLocaleString("nl-BE",{timeZone:"Europe/Brussels"})}</p> : <>
        <form action={updateTicket} className="ticket-toolbar">{hidden}<input type="hidden" name="action" value="assign"/><label>Behandelaar<select name="assigned_to" defaultValue={ticket.assigned_to??""}><option value="">Niet toegewezen</option>{((candidates.data??[]) as {id:string;name:string}[]).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><button className="secondary">Toewijzen</button></form>
        <form action={updateTicket} className="ticket-toolbar">{hidden}<input type="hidden" name="action" value="status"/><label>Status<select name="status" defaultValue={ticket.status}>{Object.entries(ticketStatuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button className="secondary">Status opslaan</button></form>
      </>}</section>
      <section className="panel ticket-conversation"><div className="ticket-section-heading"><div><span className="eyebrow">GESPREK</span><h2>Gesprek en interne notities</h2></div></div><p className="ticket-help">Bijlagen worden in deze versie niet overgenomen. Interne notities blijven uitsluitend in Command Center.</p>
        <details className="ticket-intake" open={Boolean(snapshot)}><summary>Intakegegevens · {snapshot?.name??"Historisch ticket"}</summary>{snapshot?.questions?.map(q=>{const value=intakeAnswers?.[q.id];return <div key={q.id}><strong>{q.label}</strong><p>{Array.isArray(value)?value.map(v=>q.options?.find(o=>o.value===v)?.label??v).join(", "):value||"Niet ingevuld"}</p></div>})}{!snapshot&&<p>Dit ticket is geopend met de oorspronkelijke ticketflow. Het openingsbericht staat hieronder.</p>}</details>
        {[...(messages.data??[])].reverse().map(m=><article className={`ticket-message ticket-message-${m.direction} ${m.direction==='internal'?'ticket-note':''}`} key={m.id}><strong>{m.direction==='internal'?'Interne notitie':m.direction==='staff'?'Antwoord medewerker':'Aanvrager'}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("nl-BE",{timeZone:"Europe/Brussels"})}</time>{m.direction==='staff'&&<small>{ticketDeliveryLabels[messageDeliveries.data?.find(d=>d.message_id===m.id)?.state??'']??'Verzendstatus niet beschikbaar'}</small>}<p>{m.content}</p></article>)}
        <nav aria-label="Berichtpagina’s" className="ticket-toolbar ticket-pagination">{messagePage>1&&<Link className="secondary" href={`?pagina=${messagePage-1}`}>Nieuwere berichten</Link>}{messagePage*50<(messages.count??0)&&<Link className="secondary" href={`?pagina=${messagePage+1}`}>Oudere berichten</Link>}</nav>
        {!closed && <div className="ticket-compose">{["internal","reply"].map(action=><form action={updateTicket} className="ticket-compose-form" key={action}>{hidden}<input type="hidden" name="action" value={action}/><label>{action==='internal'?'Interne notitie':'Extern antwoord'}<span className="ticket-compose-hint">{action==='internal'?'Alleen zichtbaar voor ticketmedewerkers in CC.':'Dit antwoord wordt in de privéthread op Discord geplaatst.'}</span><textarea name="content" maxLength={4000} required rows={4} placeholder={action==='internal'?'Voeg context toe voor je collega’s…':'Schrijf je antwoord aan de aanvrager…'}/></label><button className={action==='internal'?'secondary':'primary'} disabled={action==='reply'&&ticket.link_status!=='linked'}>{action==='internal'?'Notitie bewaren':'Versturen naar Discord'}</button></form>)}</div>}
      </section>
      <section className="panel ticket-deliveries"><details><summary>Discordopdrachten <span>{deliveries.data?.length ?? 0}</span></summary><div className="ticket-delivery-list">{(deliveries.data??[]).map(d=><p key={d.id}>{({create_thread:'Privéthread koppelen',send_message:'Bericht verzenden',close_thread:'Thread sluiten',delete_thread:'Thread verwijderen'} as Record<string,string>)[d.kind]} · {ticketDeliveryLabels[d.state]} {d.last_error&&`(${d.last_error})`}</p>)}
      {deliveries.data?.some(d=>['failed','uncertain'].includes(d.state)) && <form action={updateTicket}>{hidden}<input type="hidden" name="action" value="recover"/><button className="secondary">Herstel laten controleren</button><p>De bot controleert eerst bestaande threads of berichten; dit vraagt geen blinde herverzending.</p></form>}</div></details></section></div>
    </div></AppShell>;
}
