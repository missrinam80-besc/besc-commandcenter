import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormModal } from "@/components/form-modal";
import { deleteAccessRole, saveAccessRole } from "@/app/app/beheer/actions";
import { requirePermission } from "@/lib/auth-context";
import {
  accessMatrixForProfile,
  accessMatrixForRole,
  accessRoleLabels,
  type AccessDecision,
  type AccessRoleKey,
} from "@/lib/access-matrix";
import { capabilities, type Capability } from "@/lib/permissions";

const roles: AccessRoleKey[] = [
  "admin",
  "board",
  "member",
  "volunteer",
  "streamteam",
  "sponsor",
];

const decisionLabels: Record<AccessDecision, string> = {
  yes: "Ja",
  own: "Eigen",
  limited: "Beperkt",
  no: "Nee",
};

const capabilityLabels: Record<Capability, string> = {
  manageUsers: "Gebruikers beheren",
  manageOrganization: "Organisatie beheren",
  manageInbox: "Inbox beheren",
  manageDiscordBot: "Discordbot beheren",
  manageTickets: "Discordtickets behandelen",
  manageRewards: "BESC Bucks en XP beheren",
  manageProjects: "Projecten beheren",
  manageContent: "Content beheren",
  manageEvents: "Events beheren",
  manageFinance: "Financiën beheren",
  submitExpenses: "Kosten indienen",
  viewFinance: "Financiën bekijken",
  manageIntegrations: "Integraties beheren",
  manageKpis: "KPI’s beheren",
  manageAiTemplates: "AI-templates beheren",
  useAi: "AI gebruiken",
};

type CustomRoleRow = {
  id: string;
  name: string;
  description: string | null;
  base_role: string;
  finance_role: string;
  capabilities: string[] | null;
  is_system: boolean;
};

function decisionClass(decision: AccessDecision) {
  return `permission-decision ${decision}`;
}

function Decision({ value }: { value: AccessDecision }) {
  return <span role="cell" className={decisionClass(value)}>{decisionLabels[value]}</span>;
}

function RoleForm({ role }: { role?: CustomRoleRow }) {
  const selected = new Set(role?.capabilities ?? []);
  return (
    <form action={saveAccessRole} className="access-role-form">
      {role?.id && <input type="hidden" name="id" value={role.id}/>}
      <label>
        <span>Naam</span>
        <input name="name" defaultValue={role?.name ?? ""} placeholder="Bijvoorbeeld Contentverantwoordelijke"/>
      </label>
      <label>
        <span>Beschrijving</span>
        <textarea name="description" defaultValue={role?.description ?? ""} placeholder="Waarvoor dient dit rolprofiel?"/>
      </label>
      <div className="access-role-baseline">
        <label>
          <span>Basisrol</span>
          <select name="base_role" defaultValue={role?.base_role ?? "volunteer"}>
            <option value="volunteer">Vrijwilliger</option>
            <option value="member">Crew</option>
            <option value="board">Bestuur</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label>
          <span>Bestuursfunctie voor de voorvertoning</span>
          <select name="finance_role" defaultValue={role?.finance_role ?? "none"}>
            <option value="none">Geen financiële rol</option>
            <option value="submitter">Kostenindiener</option>
            <option value="approver">Goedkeurder</option>
            <option value="treasurer">Boekhouder</option>
            <option value="approver_treasurer">Goedkeurder en Boekhouder</option>
          </select>
        </label>
      </div>
      <fieldset className="capability-picker">
        <legend>Extra rechten</legend>
        {capabilities.filter((capability) => !["manageUsers", "manageIntegrations", "manageFinance"].includes(capability)).map((capability) => (
          <label key={capability}>
            <input type="checkbox" name="capabilities" value={capability} defaultChecked={selected.has(capability)}/>
            <span>{capabilityLabels[capability]}</span>
          </label>
        ))}
      </fieldset>
      <button className="primary">Rolprofiel opslaan</button>
    </form>
  );
}

export default async function AccessControlPage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string; functie?: string; nieuw?: string; bewerken?: string; fout?: string; succes?: string }>;
}) {
  const { supabase, membership } = await requirePermission("manageUsers", "/app?fout=geen-toegang");
  const query = await searchParams;
  const { data: customRoleRows } = await supabase
    .from("organization_access_roles")
    .select("id,name,description,base_role,finance_role,capabilities,is_system")
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .order("name");
  const customRoles = (customRoleRows ?? []) as CustomRoleRow[];
  const editingRole = query.bewerken ? customRoles.find((role) => role.id === query.bewerken) : null;
  const activeCustomRole = query.rol?.startsWith("custom:")
    ? customRoles.find((role) => `custom:${role.id}` === query.rol)
    : null;
  const activeRole = !activeCustomRole && roles.includes(query.rol as AccessRoleKey)
    ? query.rol as AccessRoleKey
    : "admin";
  const financeRole = activeRole === "board" && ["approver", "treasurer", "approver_treasurer"].includes(query.functie ?? "") ? query.functie! : "none";
  const rows = activeCustomRole
    ? accessMatrixForProfile({ role: activeCustomRole.base_role, finance_role: activeCustomRole.finance_role, capabilities: activeCustomRole.capabilities ?? [] })
    : activeRole === "board" ? accessMatrixForProfile({ role: "board", finance_role: financeRole }) : accessMatrixForRole(activeRole);

  return (
    <AppShell active="Rechtencontrole">
      <header className="topbar module-top">
        <div>
          <p>ADMIN & RECHTEN</p>
          <h1>Rechtencontrole</h1>
        </div>
        <div className="project-actions">
          <Link href="/app/beheer/gebruikers">Gebruikers</Link>
          <a href="https://github.com/missrinam80-besc/besc-commandcenter/blob/main/docs/wiki/Rollen-en-profielen.md" target="_blank" rel="noreferrer">Wiki</a>
          <Link className="primary" href="/app/beheer/rechten?nieuw=rol"><Plus size={16}/>Rolprofiel toevoegen</Link>
        </div>
      </header>
      <div className="module-body permissions-audit-page">
        {query.fout && <div className="error-note">Actie mislukt: {query.fout}.</div>}
        {query.succes && <div className="success">Rechtenbeheer is bijgewerkt.</div>}
        {query.nieuw === "rol" && <FormModal title="Rolprofiel toevoegen"><RoleForm/></FormModal>}
        {editingRole && <FormModal title={`Rolprofiel bewerken · ${editingRole.name}`}>
          <RoleForm role={editingRole}/>
          <div className="modal-danger-zone">
            <form action={deleteAccessRole}>
              <input type="hidden" name="id" value={editingRole.id}/>
              <label>
                <span>Typ VERWIJDER om dit profiel te verwijderen</span>
                <input name="confirm" placeholder="VERWIJDER"/>
              </label>
              <ConfirmSubmitButton className="danger-button" message="Dit rolprofiel verwijderen en loskoppelen van gebruikers?">
                <Trash2 size={14}/>Verwijderen
              </ConfirmSubmitButton>
            </form>
          </div>
        </FormModal>}

        <section className="panel role-selection-panel">
          <nav className="permission-role-tabs" aria-label="Basisrol">
            {roles.map((role) => <Link key={role} className={!activeCustomRole && role === activeRole ? "active" : ""} aria-current={!activeCustomRole && role === activeRole ? "page" : undefined} href={`?rol=${role}`}>{accessRoleLabels[role]}</Link>)}
          </nav>
          {activeRole === "board" && !activeCustomRole && <form className="role-function-filter">
            <input type="hidden" name="rol" value="board"/>
            <label>Bestuursfunctie<select name="functie" defaultValue={financeRole}>
              <option value="none">Geen extra functie</option><option value="approver">Goedkeurder</option><option value="treasurer">Boekhouder</option><option value="approver_treasurer">Beide functies</option>
            </select></label><button>Toon rechten</button>
          </form>}
        </section>

        <details className="panel role-profiles-panel" open={Boolean(activeCustomRole || editingRole || query.nieuw === "rol")}>
          <summary>Aanvullende rolprofielen · {customRoles.length}</summary>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Beheer</span>
              <h2>Rolprofielen</h2>
            </div>
            <span>{customRoles.length} profielen</span>
          </div>
          <div className="access-role-list">
            {customRoles.map((role) => (
              <article key={role.id}>
                <div>
                  <strong>{role.name}</strong>
                  <span>{role.description || "Geen beschrijving"} · {role.capabilities?.length ?? 0} extra rechten</span>
                </div>
                <Link className="row-action" href={`/app/beheer/rechten?rol=custom:${role.id}`}>Matrix</Link>
                <Link className="row-action" href={`/app/beheer/rechten?bewerken=${role.id}`}><Pencil size={13}/>Bewerken</Link>
              </article>
            ))}
            {!customRoles.length && <div className="empty">Geen aanvullende rolprofielen.</div>}
          </div>
        </details>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Actieve rol</span>
              <h2 id="active-role-name">{activeCustomRole?.name ?? accessRoleLabels[activeRole]}</h2>
            </div>
            <span>{rows.filter(row => row.view !== "no").length} zichtbaar · {rows.length} onderdelen</span>
          </div>
          <div className="permissions-table" role="table" aria-labelledby="active-role-name" tabIndex={0}>
            <div className="permissions-head" role="row">
              <span role="columnheader">Onderdeel</span>
              <span role="columnheader">Zien</span>
              <span role="columnheader">Aanmaken</span>
              <span role="columnheader">Bewerken</span>
              <span role="columnheader">Archiveren</span>
              <span role="columnheader">Verwijderen</span>
              <span role="columnheader">Exporteren</span>
              <span role="columnheader">Goedkeuren</span>

            </div>
            {rows.map((row) => (
              <article key={row.key} role="row">
                <strong role="rowheader">{row.label}</strong>
                <Decision value={row.view}/>
                <Decision value={row.create}/>
                <Decision value={row.edit}/>
                <Decision value={row.archive}/>
                <Decision value={row.delete}/>
                <Decision value={row.export}/>
                <Decision value={row.approve}/>

              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
