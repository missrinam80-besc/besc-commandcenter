import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MeetingForm } from "@/components/meeting-form";
import { FormModal } from "@/components/form-modal";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";

type MeetingAction = {
  id: string;
  title: string;
  status: string;
  assignee_text: string | null;
  task_id: string | null;
  meeting_id: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const openActionsOnly = q.actiepunten === "open";
  const { supabase, membership } = await requireActiveMembership();
  const [meetingResult, actionResult] = await Promise.all([
    supabase
      .from("meetings")
      .select("*")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("meeting_at", { ascending: false }),
    openActionsOnly
      ? supabase
          .from("meeting_action_items")
          .select("id,title,status,assignee_text,task_id,meeting_id")
          .eq("organization_id", membership.organization_id)
          .in("status", ["todo", "doing"])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const data = meetingResult.data ?? [];
  const actions = (actionResult.data ?? []) as MeetingAction[];
  const meetingNames = new Map(data.map((meeting) => [meeting.id, meeting.title]));

  return (
    <AppShell active="Vergaderingen & besluiten">
      <header className="topbar module-top">
        <div><p>BESTUUR & GOVERNANCE</p><h1>Vergaderingen & besluiten</h1></div>
        <Link className="primary" href="?nieuw=1">Nieuwe vergadering</Link>
      </header>
      <div className="module-body">
        <p className="lead">Bewaar agenda, notulen, formele besluiten en opvolgbare actiepunten samen.</p>
        {q.fout && <div className="error-note">Opslaan is mislukt ({q.fout}).</div>}
        <section className="history-stats">
          <article><span>Totaal</span><strong>{data.length}</strong></article>
          <article><span>Gepland</span><strong>{data.filter((item) => ["planned", "confirmed"].includes(item.status)).length}</strong></article>
          <article><span>Afgerond</span><strong>{data.filter((item) => item.status === "completed").length}</strong></article>
        </section>
        {q.nieuw && (
          <FormModal title="Nieuwe vergadering">
            <MeetingForm />
          </FormModal>
        )}
        {openActionsOnly && (
          <section id="open-actiepunten" className="project-task-section administration-wide">
            <div className="section-heading">
              <div><span className="eyebrow">OPVOLGING</span><h2>Open actiepunten</h2></div>
              <span>{actions.length} open</span>
            </div>
            <div className="administration-list">
              {actions.map((action) => (
                <article key={action.id}>
                  <div>
                    <strong>{action.title}</strong>
                    <span>{meetingNames.get(action.meeting_id) ?? "Vergadering"} · {action.assignee_text || "Niet toegewezen"}</span>
                  </div>
                  <span className="badge">{action.status === "doing" ? "Bezig" : "Te doen"}</span>
                  <Link className="row-action" href={action.task_id ? `/app/taken/${action.task_id}` : `/app/vergaderingen/${action.meeting_id}`}>
                    {action.task_id ? "Open taak" : "Open vergadering"}
                  </Link>
                </article>
              ))}
              {!actions.length && <p className="empty-inline">Geen open actiepunten.</p>}
            </div>
            <Link className="filter-reset" href="/app/vergaderingen">Toon alle vergaderingen</Link>
          </section>
        )}
        {!openActionsOnly && (
          <div className="operations-table">
            <div className="operations-head"><span>Vergadering</span><span>Type</span><span>Datum / deelnemers</span><span>Status</span><span></span></div>
            {data.map((meeting) => (
              <article key={meeting.id}>
                <div><strong>{meeting.title}</strong><p>{meeting.decisions || meeting.notes || "Geen verslaginformatie"}</p></div>
                <span>{meeting.meeting_type}</span>
                <span>{meeting.meeting_at ? formatDateTime(meeting.meeting_at) : `${(meeting.attendees ?? []).length} deelnemers`}</span>
                <span className="badge purple">{meeting.status}</span>
                <Link className="row-action" href={`/app/vergaderingen/${meeting.id}`}>Openen</Link>
              </article>
            ))}
            {!data.length && <div className="empty">Nog geen vergaderingen.</div>}
          </div>
        )}
      </div>
    </AppShell>
  );
}
