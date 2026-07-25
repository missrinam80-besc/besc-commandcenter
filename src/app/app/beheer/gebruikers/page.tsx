import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth-context";
import {
  type FinanceRole,
  type OrganizationRole,
  financeRoleLabels,
  organizationRoleLabels,
} from "@/lib/permissions";
import { updateMemberAccess } from "../actions";

type MemberRow = {
  user_id: string;
  role: OrganizationRole;
  status: string;
  finance_role: FinanceRole;
  joined_at: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};

const statusLabels: Record<string, string> = {
  pending: "Wacht op goedkeuring",
  active: "Actief",
  suspended: "Geschorst",
};

const accessLevels = [
  {
    title: "Beheerder",
    description: "Volledige toegang, inclusief gebruikers, rollen en organisatie-instellingen.",
  },
  {
    title: "Bestuur",
    description: "Beheert operationele modules, projecten, content, events en rapportage, maar geen gebruikersrollen.",
  },
  {
    title: "Teamlid",
    description: "Werkt met toegewezen werk, taken en beschikbare informatie zonder organisatiebrede instellingen te wijzigen.",
  },
  {
    title: "Vrijwilliger",
    description: "Beperkte werktoegang voor concrete taken en samenwerking binnen BESC.",
  },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requirePermission("manageUsers");
  const { data } = await supabase
    .from("organization_members")
    .select("user_id,role,status,finance_role,joined_at,profiles(display_name,avatar_url)")
    .eq("organization_id", membership.organization_id)
    .order("joined_at", { ascending: false });
  const members = (data ?? []) as unknown as MemberRow[];

  return (
    <AppShell active="Gebruikers" role="Beheerder">
      <header className="topbar module-top">
        <div><p>BEHEER</p><h1>Gebruikers en toegang</h1></div>
        <span className="badge">{members.length} accounts</span>
      </header>
      <div className="module-body">
        <p className="lead">
          Beheer algemene toegang en geef financiële bevoegdheden afzonderlijk aan de juiste mensen.
        </p>
        {query.fout && <div className="error-note">Wijziging mislukt: {query.fout}.</div>}
        {query.succes && <div className="success">De gebruikerstoegang werd bijgewerkt.</div>}

        <section aria-labelledby="access-title">
          <div className="section-heading">
            <div><span>Rechtenmodel</span><h2 id="access-title">Wie mag wat?</h2></div>
          </div>
          <div className="permission-grid">
            {accessLevels.map((level) => (
              <article className="permission-card" key={level.title}>
                <strong>{level.title}</strong>
                <p>{level.description}</p>
              </article>
            ))}
          </div>
          <p className="field-help">
            Financiële rollen staan los van de algemene rol. Zo kan iemand bijvoorbeeld teamlid én
            kostenindiener zijn zonder toegang tot alle financiële instellingen.
          </p>
        </section>

        <div className="member-grid">
          {members.map((member) => (
            <article key={member.user_id}>
              <div className="member-info">
                <div className="avatar">
                  {(member.profiles?.display_name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{member.profiles?.display_name || "Naamloos account"}</strong>
                  <span>
                    {statusLabels[member.status] || member.status} · {organizationRoleLabels[member.role]} ·{" "}
                    {financeRoleLabels[member.finance_role]}
                  </span>
                </div>
              </div>
              <form action={updateMemberAccess}>
                <input type="hidden" name="user_id" value={member.user_id}/>
                <label>
                  <span>Algemene rol</span>
                  <select name="role" defaultValue={member.role}>
                    <option value="admin">Beheerder</option>
                    <option value="board">Bestuur</option>
                    <option value="member">Teamlid</option>
                    <option value="volunteer">Vrijwilliger</option>
                  </select>
                </label>
                <label>
                  <span>Financiële rol</span>
                  <select name="finance_role" defaultValue={member.finance_role}>
                    <option value="none">Geen financiële rol</option>
                    <option value="submitter">Kostenindiener</option>
                    <option value="approver">Goedkeurder</option>
                    <option value="treasurer">Penningmeester</option>
                  </select>
                </label>
                <label>
                  <span>Accountstatus</span>
                  <select name="status" defaultValue={member.status}>
                    <option value="pending">Wachtend</option>
                    <option value="active">Actief</option>
                    <option value="suspended">Geschorst</option>
                  </select>
                </label>
                <button type="submit">Opslaan</button>
              </form>
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
