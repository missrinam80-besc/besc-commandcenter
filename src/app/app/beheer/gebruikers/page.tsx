import { MemberRoleFields } from "@/components/member-role-fields";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { FormModal } from "@/components/form-modal";
import { requirePermission } from "@/lib/auth-context";
import {
  type FinanceRole,
  type OrganizationRole,
  financeRoleLabels,
  organizationRoleLabels,
} from "@/lib/permissions";
import { linkMemberContact, revokePortalAccess, savePortalAccess, updateMemberAccess } from "../actions";

type MemberRow = {
  user_id: string;
  role: OrganizationRole;
  status: string;
  finance_role: FinanceRole;
  access_role_id: string | null;
  joined_at: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};

type AccessRoleRow = {
  id: string;
  name: string;
  description: string | null;
};

const statusLabels: Record<string, string> = {
  pending: "Wacht op goedkeuring",
  active: "Actief",
  suspended: "Geschorst",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, membership } = await requirePermission("manageUsers");
  const [{data},{data:accessRows},{data:partners},{data:people,error:peopleError},{data:customRoles}] = await Promise.all([
    supabase.from("organization_members").select("user_id,role,status,finance_role,access_role_id,joined_at,profiles(display_name,avatar_url)").eq("organization_id", membership.organization_id).order("joined_at", { ascending: false }),
    supabase.from("portal_access").select("id,user_id,access_type,status,partner_id,community_person_id,partners(name),community_people(display_name)").eq("organization_id",membership.organization_id).neq("status","revoked"),
    supabase.from("partners").select("id,name").eq("organization_id",membership.organization_id).is("deleted_at",null).order("name"),
    supabase.from("community_people").select("id,display_name,account_user_id").eq("organization_id",membership.organization_id).is("deleted_at",null).order("display_name"),
    supabase.from("organization_access_roles").select("id,name,description").eq("organization_id",membership.organization_id).is("deleted_at",null).order("name"),
  ]);
  const members = (data ?? []) as unknown as MemberRow[];
  const roleProfiles = (customRoles ?? []) as AccessRoleRow[];
  const contactUser = query.contact ? members.find(member => member.user_id === query.contact) : null;
  const missingContacts = peopleError ? [] : members.filter(member => (member.status === "active" || (accessRows ?? []).some(row => row.user_id === member.user_id && row.status === "active")) && !(people ?? []).some(person => person.account_user_id === member.user_id));
  const portalUser=query.portaal?members.find(member=>member.user_id===query.portaal):null;

  return (
    <AppShell active="Gebruikers & toegang" role="Admin">
      <header className="topbar module-top">
        <div><p>BEHEER</p><h1>Gebruikers en toegang</h1></div>
        <div className="project-actions"><Link href="/app/beheer/rechten">Rechtencontrole</Link><a href="https://github.com/missrinam80-besc/besc-commandcenter/blob/main/docs/wiki/Rollen-en-profielen.md" target="_blank" rel="noreferrer">Wiki</a><span className="badge">{members.length} accounts</span></div>
      </header>
      <div className="module-body">
        <p className="lead">
          Beheer algemene toegang en geef financiële bevoegdheden afzonderlijk aan de juiste mensen.
        </p>
        {query.fout && <div className="error-note">Wijziging mislukt: {query.fout}.</div>}
        {query.succes && <div className="success">{query.succes === "contact" ? "Het account is gekoppeld aan het contact." : "De gebruikerstoegang werd bijgewerkt."}</div>}
        {peopleError && <p className="error-note">De contacten konden niet worden geladen. De accountkoppelingen zijn tijdelijk niet beschikbaar.</p>}
        {missingContacts.length > 0 && <p className="error-note">{missingContacts.length} {missingContacts.length === 1 ? "account met toegang heeft" : "accounts met toegang hebben"} nog geen contactkoppeling. Kies Contact koppelen bij het account; bestaande of eerder verwijderde contacten worden niet automatisch samengevoegd.</p>}
        {contactUser && !peopleError && <FormModal title={`Contact koppelen · ${contactUser.profiles?.display_name || "Naamloos account"}`} closeHref="/app/beheer/gebruikers"><form action={linkMemberContact}><input type="hidden" name="user_id" value={contactUser.user_id}/><label>Bestaand contact<select name="person_id" required><option value="">Kies het contact van deze persoon</option>{(people ?? []).filter(person => !person.account_user_id || person.account_user_id === contactUser.user_id).map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label><div className="form-actions"><button className="primary">Contact koppelen</button><Link href="/app/community?nieuw=1">Nieuw contact voorbereiden</Link></div></form></FormModal>}
        {portalUser&&<FormModal title={`Portaaltoegang · ${portalUser.profiles?.display_name||"Naamloos account"}`}><div className="relation-list">{(accessRows??[]).filter(item=>item.user_id===portalUser.user_id).map(item=>{const partner=item.partners as unknown as {name?:string}|null,person=item.community_people as unknown as {display_name?:string}|null;return <article key={item.id}><div><strong>{item.access_type==="sponsor"?"Sponsor":"Streamteam"}</strong><span>{partner?.name||person?.display_name||"Onbekend dossier"} · {statusLabels[item.status] || item.status}</span></div><form action={revokePortalAccess}><input type="hidden" name="id" value={item.id}/><input type="hidden" name="user_id" value={portalUser.user_id}/><button>Intrekken</button></form></article>})}</div><form action={savePortalAccess}><input type="hidden" name="user_id" value={portalUser.user_id}/><input type="hidden" name="access_type" value="sponsor"/><label>Sponsor toevoegen<select name="target_id" required><option value="">Kies sponsor</option>{(partners??[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button>Toegang geven</button></form><form action={savePortalAccess}><input type="hidden" name="user_id" value={portalUser.user_id}/><input type="hidden" name="access_type" value="streamer"/><label>Streamteam toevoegen<select name="target_id" required><option value="">Kies persoon</option>{(people??[]).map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><button>Toegang geven</button></form></FormModal>}

        <div className="member-grid">
          {members.map((member) => (
            <article key={member.user_id} className="member-access-row">
              <div className="member-info">
                <div className="avatar">
                  {(member.profiles?.display_name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{member.profiles?.display_name || "Naamloos account"}</strong>
                  {!peopleError && ((people ?? []).find(person => person.account_user_id === member.user_id) ? <Link className="row-action" href={`/app/community/${(people ?? []).find(person => person.account_user_id === member.user_id)!.id}`}>Contact openen</Link> : <Link className="row-action" href={`?contact=${member.user_id}`}>Contact koppelen</Link>)}
                  <span>
                    {statusLabels[member.status] || member.status} · {organizationRoleLabels[member.role]}
                    {member.finance_role !== "none" && <> · {financeRoleLabels[member.finance_role]}</>}
                    {(accessRows ?? []).filter(item => item.user_id === member.user_id).map(item => <b className="badge" key={item.id}>{item.access_type === "sponsor" ? "Sponsor" : "Streamteam"}</b>)}
                  </span>
                </div>
              </div>
              <form action={updateMemberAccess} className="member-access-form">
                <input type="hidden" name="user_id" value={member.user_id}/>
                <div className="member-access-fields">
                <MemberRoleFields role={member.role} financeRole={member.finance_role}/>
                <label>
                  <span>Rolprofiel</span>
                  <select name="access_role_id" defaultValue={member.access_role_id ?? ""}>
                    <option value="">Geen extra profiel</option>
                    {roleProfiles.map((role) => (
                      <option value={role.id} key={role.id}>{role.name}</option>
                    ))}
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
                </div>
                <div className="member-access-actions">
                  <button type="submit">Opslaan</button>
                  <Link className="row-action" href={`?portaal=${member.user_id}`}>Portaaltoegang</Link>
                </div>
              </form>
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
