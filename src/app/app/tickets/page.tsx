import {hasPermission} from "@/lib/permissions";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth-context";
import { ticketStatuses, ticketLinkLabels, ticketDeliveryLabels, ticketErrors } from "@/lib/tickets";
import { retryTicketCleanup } from "./actions";

export default async function Tickets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase, membership } = await requirePermission("manageTickets");
  const params = await searchParams;
  const status = Object.hasOwn(ticketStatuses, params.status ?? "") ? params.status : undefined;
  const page = Math.min(1000, Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1));
  let query = supabase.from("support_tickets").select("id,subject,status,link_status,created_at", { count: "exact" })
    .eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).order("id").range((page-1)*25,page*25-1);
  if (status) query = query.eq("status", status);
  const [tickets, cleanup] = await Promise.all([query, supabase.from("support_ticket_deliveries").select("id,state,last_error")
    .eq("organization_id",membership.organization_id).is("ticket_id",null).eq("kind","delete_thread").neq("state","delivered").order("created_at").limit(50)]);
  return <AppShell active="Discordtickets">
    <header className="topbar module-top"><div><p>RELATIES & COMMUNICATIE</p><h1>Discordtickets</h1></div>{hasPermission(membership,"manageDiscordBot")&&<Link className="secondary" href="/app/beheer/discordbot">Botinstellingen</Link>}</header>
    <div className="module-body ticket-overview">
      <p className="lead">Behandel Discordvragen binnen je organisatie. Gesloten tickets en gesprekken worden 180 dagen na sluiten verwijderd.</p>
      {(tickets.error || cleanup.error) && <p className="error-note">Tickets konden niet worden geladen. Controleer de inrichting van de ticketmodule.</p>}
      {params.fout && <p className="error-note">{ticketErrors[params.fout] ?? ticketErrors.upstream_unavailable}</p>}
      <form className="panel ticket-toolbar"><label>Status<select name="status" defaultValue={status ?? ""}><option value="">Alle statussen</option>{Object.entries(ticketStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="secondary">Filteren</button>{status && <Link className="ticket-reset" href="/app/tickets">Filter wissen</Link>}</form>
      <section className="panel ticket-list-panel"><div className="ticket-section-heading"><div><span className="eyebrow">OVERZICHT</span><h2>Tickets</h2></div><span className="ticket-count">{tickets.count ?? 0} tickets</span></div><div className="table-wrap"><table className="ticket-table"><thead><tr><th>Onderwerp</th><th>Status</th><th>Discord</th><th>Aangemaakt</th></tr></thead><tbody>
        {(tickets.data ?? []).map(t=><tr key={t.id}><td><Link href={`/app/tickets/${t.id}`}>{t.subject}</Link></td><td><span className={"ticket-status ticket-status-"+t.status}>{ticketStatuses[t.status as keyof typeof ticketStatuses]}</span></td><td><span className="ticket-link-state">{ticketLinkLabels[t.link_status]}</span></td><td>{new Date(t.created_at).toLocaleString("nl-BE",{timeZone:"Europe/Brussels"})}</td></tr>)}
      </tbody></table></div>{!tickets.error && !tickets.data?.length && <div className="ticket-empty"><strong>Geen tickets gevonden</strong><p>{status ? "Kies een andere status of wis het filter." : "Nieuwe Discordtickets verschijnen hier zodra iemand een ticket opent."}</p></div>}
      <nav aria-label="Ticketpagina’s" className="ticket-toolbar ticket-pagination">{page>1 && <Link className="secondary" href={`?pagina=${page-1}&status=${status??""}`}>Vorige</Link>}{page*25<(tickets.count??0) && <Link className="secondary" href={`?pagina=${page+1}&status=${status??""}`}>Volgende</Link>}</nav></section>
      {!!cleanup.data?.length && <section className="panel ticket-cleanup"><h2>Discordverwijdering</h2><p>De ticketinhoud is verwijderd. Deze opdrachten bevatten uitsluitend technische IDs.</p>{cleanup.data.map(d=><form action={retryTicketCleanup} className="ticket-toolbar" key={d.id}><input type="hidden" name="delivery_id" value={d.id}/><span>{ticketDeliveryLabels[d.state]} {d.last_error && `(${d.last_error})`}</span>{["failed","uncertain"].includes(d.state) && <button className="secondary">Herstel controleren</button>}</form>)}</section>}
    </div>
  </AppShell>;
}
