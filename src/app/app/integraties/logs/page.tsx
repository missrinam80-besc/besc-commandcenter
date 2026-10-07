import Link from "next/link";
import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
const syncLabels: Record<string, string> = {
  queued: "In wachtrij",
  running: "Bezig",
  succeeded: "Geslaagd",
  partial: "Gedeeltelijk",
  failed: "Mislukt",
  cancelled: "Geannuleerd",
};

type SyncRun = {
  id: string;
  social_account_id: string;
  trigger_type: string;
  status: string;
  records_read: number;
  records_written: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
};


export default async function Page() {
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) return <AppShell active="Integraties"><div className="module-body permission-note">Alleen bestuur en beheerders kunnen integratielogs bekijken.</div></AppShell>;
  const [accountResult, runResult] = await Promise.all([
    supabase.from("social_accounts").select("id,account_name").eq("organization_id", membership.organization_id),
    supabase.from("social_sync_runs").select("*").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(50),
  ]);
  const accounts = accountResult.data ?? [];
  const runs = (runResult.data ?? []) as SyncRun[];
  return <AppShell active="Integraties">
    <header className="topbar module-top"><div><p>VERBINDINGEN & AUTOMATISERING</p><h1>Integratielogs</h1></div><div className="project-actions"><Link href="/app/integraties">Integraties</Link></div></header>
    <div className="module-body integration-overview">
      {accountResult.error || runResult.error ? <div className="error-note">De logs konden niet worden geladen.</div> :         <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">CONTROLE</span><h2>Laatste 50 synchronisaties</h2></div><RefreshCw size={16}/></div>
          <div className="social-sync-list">
            {runs.map((run) => {
              const account = accounts.find((item) => item.id === run.social_account_id);
              return <article key={run.id}>
                {run.status === "succeeded" ? <CheckCircle2/> : <Clock3/>}
                <div><strong>{account?.account_name ?? "Onbekend account"}</strong><span>{run.trigger_type} · {new Intl.DateTimeFormat("nl-BE", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(run.created_at))}</span>{run.error_message ? <small>{run.error_message}</small> : null}</div>
                <b className={`integration-status ${run.status}`}>{syncLabels[run.status] ?? run.status}</b>
                <span>{run.records_written}/{run.records_read} verwerkt</span>
              </article>;
            })}
            {!runs.length ? <div className="empty">Nog geen synchronisaties uitgevoerd.</div> : null}
          </div>
        </section>

}
    </div>
  </AppShell>;
}
