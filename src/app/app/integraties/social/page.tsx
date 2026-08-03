import Link from "next/link";
import { Ban, CheckCircle2, Clock3, DatabaseZap, Plus, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormModal } from "@/components/form-modal";
import { requireActiveMembership } from "@/lib/auth-context";
import { socialAccountStatuses, socialPlatformDefinitions, socialPlatforms } from "@/lib/social-connectors";
import { metaConfiguration } from "@/lib/meta-integration";
import { threadsConfiguration } from "@/lib/threads-integration";
import { twitchConfiguration } from "@/lib/twitch-integration";
import { youtubeConfiguration } from "@/lib/youtube-integration";
import { changeSocialAccountState, saveSocialAccount, syncMetaAccount, syncThreadsAccount, syncTwitchAccount, syncYouTubeAccount } from "./actions";

const statusLabels: Record<string, string> = {
  pending: "Wacht op koppeling",
  connected: "Verbonden",
  expired: "Token verlopen",
  error: "Fout",
  disabled: "Uitgeschakeld",
  disconnected: "Losgekoppeld",
};

const syncLabels: Record<string, string> = {
  queued: "In wachtrij",
  running: "Bezig",
  succeeded: "Geslaagd",
  partial: "Gedeeltelijk",
  failed: "Mislukt",
  cancelled: "Geannuleerd",
};

type SocialAccount = {
  id: string;
  platform: keyof typeof socialPlatformDefinitions;
  account_name: string;
  external_account_id: string | null;
  account_type: string | null;
  status: string;
  granted_scopes: string[];
  sync_enabled: boolean;
  sync_interval_minutes: number;
  retention_days: number;
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  quota_daily_limit: number;
  quota_used_estimate: number;
  quota_counter_date: string | null;
  quota_warning_percent: number;
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

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

export default async function SocialIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    return <AppShell active="Integraties"><div className="module-body"><div className="permission-note">Alleen bestuur en beheerders kunnen social accounts beheren.</div></div></AppShell>;
  }

  const [{ data: accountData }, { data: runData }] = await Promise.all([
    supabase.from("social_accounts").select("*").eq("organization_id", membership.organization_id).is("deleted_at", null).order("platform"),
    supabase.from("social_sync_runs").select("*").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }).limit(20),
  ]);
  const accounts = (accountData ?? []) as SocialAccount[];
  const runs = (runData ?? []) as SyncRun[];
  const youtubeConfig = youtubeConfiguration();
  const metaConfig = metaConfiguration();
  const threadsConfig = threadsConfiguration();
  const twitchConfig = twitchConfiguration();
  const selected = accounts.find((item) => item.id === query.account);
  const showForm = query.nieuw === "1" || Boolean(selected);

  return (
    <AppShell active="Integraties">
      <header className="topbar module-top">
        <div><p>SOCIAL ACCOUNT & DATA</p><h1>Social integraties</h1></div>
        <div className="project-actions"><Link href="/app/integraties">Alle integraties</Link><Link className="primary" href="?nieuw=1"><Plus size={15}/>Account registreren</Link></div>
      </header>
      <div className="module-body social-integration-page">
        <p className="lead">Beheer accountmetadata, synchronisatie en meetgegevens. OAuth-tokens staan versleuteld in Vault en worden nooit in formulieren of gewone tabellen getoond.</p>
        {query.fout ? <div className="error-note">De actie is mislukt ({query.fout}).</div> : null}
        {query.succes ? <div className="success">Het social account is bijgewerkt.</div> : null}

        <section className="integration-security">
          <ShieldCheck/><div><strong>Veilige koppelingen</strong><span>Alleen de serverrol kan OAuth-geheimen opslaan of lezen. YouTube, Facebook en Instagram gebruiken officiële OAuth- en analytics-API&apos;s.</span></div>
        </section>
        {!youtubeConfig.configured ? <div className="error-note">Voor de YouTube-pilot ontbreken nog servervariabelen: {youtubeConfig.missing.join(", ")}. De OAuth-callback wordt <code>{youtubeConfig.callbackUrl}</code>.</div> : null}
        {!metaConfig.configured ? <div className="error-note">Voor de Meta-pilot ontbreken nog servervariabelen: {metaConfig.missing.join(", ")}. De OAuth-callback wordt <code>{metaConfig.callbackUrl}</code>.</div> : null}
        {!threadsConfig.configured ? <div className="error-note">Voor Threads ontbreken nog servervariabelen: {threadsConfig.missing.join(", ")}. De OAuth-callback wordt <code>{threadsConfig.callbackUrl}</code>.</div> : null}
        {!twitchConfig.configured ? <div className="error-note">Voor Twitch ontbreken nog servervariabelen: {twitchConfig.missing.join(", ")}. De OAuth-callback wordt <code>{twitchConfig.callbackUrl}</code>.</div> : null}

        <section className="social-platform-grid">
          {socialPlatforms.map((platform) => {
            const definition = socialPlatformDefinitions[platform];
            const count = accounts.filter((item) => item.platform === platform).length;
            return <article key={platform} className={`social-platform-card ${definition.state}`}>
              <div><strong>{definition.label}</strong><span>{definition.phase}</span></div>
              <b>{definition.state === "ready_for_pilot" ? "Pilot gereed" : definition.state === "planned" ? "Gepland" : "Voorwaardelijk"}</b>
              <p>{definition.capabilities.join(" · ")}</p>
              {definition.requirement ? <small>Voorwaarde: {definition.requirement}</small> : null}
              <small>{count} account{count === 1 ? "" : "s"} geregistreerd</small>
            </article>;
          })}
        </section>

        <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">ACCOUNTS</span><h2>Geregistreerde kanalen</h2></div><span>{accounts.length} totaal</span></div>
          <div className="social-account-list">
            {accounts.map((account) => {
              const definition = socialPlatformDefinitions[account.platform];
              const quotaPercent = Math.round(account.quota_used_estimate / Math.max(account.quota_daily_limit, 1) * 100);
              return <article key={account.id}>
                <DatabaseZap/>
                <div><strong>{account.account_name}</strong><span>{definition.label} · {account.external_account_id || "Nog geen extern account-ID"}</span>{account.last_error ? <small>{account.last_error}</small> : null}</div>
                <div className="social-account-meta"><b className={`integration-status ${account.status}`}>{statusLabels[account.status] ?? account.status}</b><span>{account.sync_enabled ? `Elke ${account.sync_interval_minutes} min.` : "Sync uit"}</span><span className={quotaPercent >= account.quota_warning_percent ? "quota-warning" : ""}>Quota: {account.quota_used_estimate}/{account.quota_daily_limit}</span></div>
                <div className="social-account-actions">
                  {account.platform === "youtube" && account.status === "connected" ? <form action={syncYouTubeAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {account.platform === "youtube" && account.status !== "connected" && youtubeConfig.configured ? <Link href={`/app/integraties/social/youtube/start?account=${account.id}`}>Koppel YouTube</Link> : null}
                  {["facebook", "instagram"].includes(account.platform) && account.status === "connected" ? <form action={syncMetaAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {["facebook", "instagram"].includes(account.platform) && account.status !== "connected" && metaConfig.configured ? <Link href={`/app/integraties/social/meta/start?account=${account.id}`}>Koppel via Meta</Link> : null}
                  {account.platform === "threads" && account.status === "connected" ? <form action={syncThreadsAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {account.platform === "threads" && account.status !== "connected" && threadsConfig.configured ? <Link href={`/app/integraties/social/threads/start?account=${account.id}`}>Koppel Threads</Link> : null}
                  {account.platform === "twitch" && account.status === "connected" ? <form action={syncTwitchAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {account.platform === "twitch" && account.status !== "connected" && twitchConfig.configured ? <Link href={`/app/integraties/social/twitch/start?account=${account.id}`}>Koppel Twitch</Link> : null}
                  <Link href={`?account=${account.id}`}>Beheren</Link>
                </div>
              </article>;
            })}
            {!accounts.length ? <div className="empty">Nog geen social accounts geregistreerd. Begin met het YouTube-kanaal voor de pilot.</div> : null}
          </div>
        </section>

        <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">CONTROLE</span><h2>Recente synchronisaties</h2></div><RefreshCw size={16}/></div>
          <div className="social-sync-list">
            {runs.map((run) => {
              const account = accounts.find((item) => item.id === run.social_account_id);
              return <article key={run.id}>
                {run.status === "succeeded" ? <CheckCircle2/> : <Clock3/>}
                <div><strong>{account?.account_name ?? "Onbekend account"}</strong><span>{run.trigger_type} · {new Date(run.created_at).toLocaleString("nl-BE")}</span>{run.error_message ? <small>{run.error_message}</small> : null}</div>
                <b className={`integration-status ${run.status}`}>{syncLabels[run.status] ?? run.status}</b>
                <span>{run.records_written}/{run.records_read} verwerkt</span>
              </article>;
            })}
            {!runs.length ? <div className="empty">Nog geen synchronisaties uitgevoerd. De eerste run verschijnt hier zodra de YouTube-pilot actief is.</div> : null}
          </div>
        </section>

        {showForm ? <FormModal title={selected ? "Social account beheren" : "Social account registreren"} closeHref="/app/integraties/social">
          <form action={saveSocialAccount}>
            <input type="hidden" name="id" value={selected?.id ?? ""}/>
            <div className="form-row">
              <label>Platform<select name="platform" defaultValue={selected?.platform ?? "youtube"}>{socialPlatforms.map((platform) => <option value={platform} key={platform}>{socialPlatformDefinitions[platform].label}</option>)}</select></label>
              <label>Accountnaam<input name="account_name" defaultValue={selected?.account_name ?? ""} placeholder="Bijvoorbeeld BESC YouTube"/></label>
              <label>Extern account-ID<input name="external_account_id" defaultValue={selected?.external_account_id ?? ""}/></label>
              <label>Accounttype<input name="account_type" defaultValue={selected?.account_type ?? ""} placeholder="Kanaal, pagina, organisatie…"/></label>
              <label>Status<select name="status" defaultValue={selected?.status ?? "pending"}>{socialAccountStatuses.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
              <label>Scopes<input name="granted_scopes" defaultValue={selected?.granted_scopes.join(", ") ?? ""} placeholder="Wordt na OAuth automatisch ingevuld"/></label>
              <label>Syncinterval in minuten<input name="sync_interval_minutes" type="number" min="15" max="43200" defaultValue={selected?.sync_interval_minutes ?? 1440}/></label>
              <label>Bewaartermijn in dagen<input name="retention_days" type="number" min="30" max="3650" defaultValue={selected?.retention_days ?? 730}/></label>
              <label>Dagelijkse interne quotalimiet<input name="quota_daily_limit" type="number" min="1" max="10000000" defaultValue={selected?.quota_daily_limit ?? 10000}/></label>
              <label>Waarschuwen vanaf %<input name="quota_warning_percent" type="number" min="1" max="100" defaultValue={selected?.quota_warning_percent ?? 80}/></label>
              <label>Token vervalt op<input name="token_expires_at" type="datetime-local" defaultValue={localDateTime(selected?.token_expires_at ?? null)}/></label>
              <label className="checkbox-label"><input name="sync_enabled" type="checkbox" defaultChecked={selected?.sync_enabled ?? false}/>Automatische synchronisatie inschakelen</label>
            </div>
            <p className="form-help">Deze pagina bewaart alleen metadata. Toegangstokens worden uitsluitend door de OAuth-callback versleuteld in Vault opgeslagen.</p>
            <div className="form-actions"><button className="primary">Opslaan</button></div>
          </form>
          {selected ? <div className="modal-danger-zone">
            <form action={changeSocialAccountState}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="status" value="disabled"/><button><Ban size={14}/>Uitschakelen</button></form>
            <form action={changeSocialAccountState}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="status" value="disconnected"/><ConfirmSubmitButton className="danger-button" message="Dit account loskoppelen en synchronisatie stoppen?"><Unplug size={14}/>Loskoppelen</ConfirmSubmitButton></form>
          </div> : null}
        </FormModal> : null}
      </div>
    </AppShell>
  );
}
