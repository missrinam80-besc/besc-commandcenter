import Link from "next/link";
import { Ban, DatabaseZap, RefreshCw, Unplug } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormModal } from "@/components/form-modal";
import { requireActiveMembership } from "@/lib/auth-context";
import { socialAccountStatuses, socialPlatformDefinitions, socialPlatforms } from "@/lib/social-connectors";
import { metaConfiguration } from "@/lib/meta-integration";
import { threadsConfiguration } from "@/lib/threads-integration";
import { twitchConfiguration } from "@/lib/twitch-integration";
import { youtubeConfiguration } from "@/lib/youtube-integration";
import { changeSocialAccountState, saveSocialAccount, syncMetaAccount, syncThreadsAccount, syncTwitchAccount, syncYouTubeAccount } from "./social/actions";

const statusLabels: Record<string, string> = {
  pending: "Wacht op koppeling",
  connected: "Verbonden",
  expired: "Token verlopen",
  error: "Fout",
  disabled: "Uitgeschakeld",
  disconnected: "Losgekoppeld",
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

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

export default async function SocialAccountsSection({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  if (!["admin", "board"].includes(membership.role)) {
    return <AppShell active="Integraties"><div className="module-body"><div className="permission-note">Alleen bestuur en beheerders kunnen social accounts beheren.</div></div></AppShell>;
  }

  const { data: accountData, error } = await supabase.from("social_accounts").select("*").eq("organization_id", membership.organization_id).is("deleted_at", null).order("platform");
  const accounts = (accountData ?? []) as SocialAccount[];
  const youtubeConfig = youtubeConfiguration();
  const metaConfig = metaConfiguration();
  const threadsConfig = threadsConfiguration();
  const twitchConfig = twitchConfiguration();
  const selected = accounts.find((item) => item.id === query.account);
  const showForm = query.nieuw === "1" || Boolean(selected);

  return (
    <section className="social-integration-page" id="social-accounts">
      {error ? <div className="error-note">Social accounts konden niet worden geladen.</div> : null}
        <section className="form-card">
          <div className="form-heading"><div><span className="eyebrow">ACCOUNTS</span><h2>Geregistreerde kanalen</h2></div><span>{accounts.length} totaal</span></div>
          <div className="social-account-list">
            {accounts.map((account) => {
              const definition = socialPlatformDefinitions[account.platform];
              const quotaPercent = Math.round(account.quota_used_estimate / Math.max(account.quota_daily_limit, 1) * 100);
              return <article key={account.id}>
                <DatabaseZap/>
                <div><strong>{account.account_name}</strong><span>{definition.label} · {account.external_account_id || "Nog geen extern account-ID"}</span>{account.last_error ? <small>{account.last_error}</small> : null}</div>
                <div className="social-account-meta"><b className={`integration-status ${account.status}`}>{statusLabels[account.status] ?? account.status}</b><span>{account.sync_enabled ? `Automatisch: elke ${account.sync_interval_minutes} min.` : "Automatisch uit"}</span><span>{account.last_sync_at ? `Laatste sync: ${new Intl.DateTimeFormat("nl-BE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(account.last_sync_at))}` : "Nog niet gesynchroniseerd"}</span><span className={quotaPercent >= account.quota_warning_percent ? "quota-warning" : ""}>Quota: {account.quota_used_estimate}/{account.quota_daily_limit}</span></div>
                <div className="social-account-actions">
                  {account.platform === "youtube" && account.status === "connected" ? <form action={syncYouTubeAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {account.platform === "youtube" && account.status !== "connected" && youtubeConfig.configured ? <Link href={`/app/integraties/social/youtube/start?account=${account.id}`}>Koppel YouTube</Link> : null}
                  {["facebook", "instagram"].includes(account.platform) && account.status === "connected" ? <form action={syncMetaAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {["facebook", "instagram"].includes(account.platform) && metaConfig.configured ? <Link href={`/app/integraties/social/meta/start?account=${account.id}`}>{account.status === "connected" ? "Opnieuw koppelen via Meta" : "Koppel via Meta"}</Link> : null}
                  {account.platform === "threads" && account.status === "connected" ? <form action={syncThreadsAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {account.platform === "threads" && account.status !== "connected" && threadsConfig.configured ? <Link href={`/app/integraties/social/threads/start?account=${account.id}`}>Koppel Threads</Link> : null}
                  {account.platform === "twitch" && account.status === "connected" ? <form action={syncTwitchAccount}><input type="hidden" name="id" value={account.id}/><button><RefreshCw size={13}/>Nu synchroniseren</button></form> : null}
                  {account.platform === "twitch" && account.status !== "connected" && twitchConfig.configured ? <Link href={`/app/integraties/social/twitch/start?account=${account.id}`}>Koppel Twitch</Link> : null}
                  <Link href={`/app/integraties?account=${account.id}`}>Beheren</Link>
                </div>
              </article>;
            })}
            {!accounts.length ? <div className="empty">Nog geen social accounts geregistreerd.</div> : null}
          </div>
        </section>

        {showForm ? <FormModal title={selected ? "Social account beheren" : "Social account registreren"} closeHref="/app/integraties">
          <form action={saveSocialAccount}>
            <input type="hidden" name="id" value={selected?.id ?? ""}/>
            <div className="form-row">
              <label>Platform<select name="platform" defaultValue={selected?.platform ?? "youtube"}>{socialPlatforms.map((platform) => <option value={platform} key={platform}>{socialPlatformDefinitions[platform].label}</option>)}</select></label>
              <label>Accountnaam<input name="account_name" defaultValue={selected?.account_name ?? ""} placeholder="Bijvoorbeeld BESC YouTube"/></label>
              <label>Extern account-ID<input name="external_account_id" defaultValue={selected?.external_account_id ?? ""}/></label>
              <label>Accounttype<input name="account_type" defaultValue={selected?.account_type ?? ""} placeholder="Kanaal, pagina, organisatie…"/></label>
              <label>Status<select name="status" defaultValue={selected?.status ?? "pending"}>{socialAccountStatuses.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
              <label>Scopes<input name="granted_scopes" readOnly={!!selected && ["facebook", "instagram"].includes(selected.platform)} defaultValue={selected?.granted_scopes.join(", ") ?? ""} placeholder="Wordt na OAuth automatisch ingevuld"/><small>Meta-rechten worden automatisch gecontroleerd bij opnieuw koppelen of na een mislukte Insights-aanvraag.</small></label>
              <label>Syncinterval in minuten<input name="sync_interval_minutes" type="number" min="15" max="43200" defaultValue={selected?.sync_interval_minutes ?? 1440}/></label>
              <label>Bewaartermijn in dagen<input name="retention_days" type="number" min="30" max="3650" defaultValue={selected?.retention_days ?? 730}/></label>
              <label>Dagelijkse interne quotalimiet<input name="quota_daily_limit" type="number" min="1" max="10000000" defaultValue={selected?.quota_daily_limit ?? 10000}/></label>
              <label>Waarschuwen vanaf %<input name="quota_warning_percent" type="number" min="1" max="100" defaultValue={selected?.quota_warning_percent ?? 80}/></label>
              <label>Token vervalt op<input name="token_expires_at" type="datetime-local" defaultValue={localDateTime(selected?.token_expires_at ?? null)}/></label>
              <label className="checkbox-label"><input name="sync_enabled" type="checkbox" defaultChecked={selected?.sync_enabled ?? false}/>Automatische synchronisatie inschakelen</label>
            </div>
            <div className="form-actions"><button className="primary">Opslaan</button></div>
          </form>
          {selected ? <div className="modal-danger-zone">
            <form action={changeSocialAccountState}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="status" value="disabled"/><button><Ban size={14}/>Uitschakelen</button></form>
            <form action={changeSocialAccountState}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="status" value="disconnected"/><ConfirmSubmitButton className="danger-button" message="Dit account loskoppelen en synchronisatie stoppen?"><Unplug size={14}/>Loskoppelen</ConfirmSubmitButton></form>
          </div> : null}
        </FormModal> : null}
    </section>
  );
}
