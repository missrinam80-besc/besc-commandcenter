import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { updateMemberAccess } from "../actions";

type MemberRow={user_id:string;role:string;status:string;joined_at:string;profiles:{display_name:string|null;avatar_url:string|null}|null};
const roleLabels:Record<string,string>={admin:"Beheerder",board:"Bestuur",member:"Teamlid",volunteer:"Vrijwilliger"};
const statusLabels:Record<string,string>={pending:"Wacht op goedkeuring",active:"Actief",suspended:"Geschorst"};
export default async function UsersPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const query=await searchParams;const{supabase,membership}=await requireActiveMembership();if(membership.role!=="admin")redirect("/app");
  const{data}=await supabase.from("organization_members").select("user_id,role,status,joined_at,profiles(display_name,avatar_url)").eq("organization_id",membership.organization_id).order("joined_at",{ascending:false});const members=(data??[]) as unknown as MemberRow[];
  return <AppShell active="Gebruikers" role="Beheerder"><header className="topbar module-top"><div><p>BEHEER</p><h1>Gebruikers en toegang</h1></div><span className="badge">{members.length} accounts</span></header><div className="module-body"><p className="lead">Keur nieuwe accounts goed en bepaal welke rol iemand binnen het Command Center krijgt.</p>{query.fout&&<div className="error-note">Wijziging mislukt: {query.fout}.</div>}{query.succes&&<div className="success">De gebruikerstoegang werd bijgewerkt.</div>}<div className="member-grid">{members.map(m=><article key={m.user_id}><div className="member-info"><div className="avatar">{(m.profiles?.display_name||"? ").slice(0,2).toUpperCase()}</div><div><strong>{m.profiles?.display_name||"Naamloos account"}</strong><span>{statusLabels[m.status]||m.status} · {roleLabels[m.role]||m.role}</span></div></div><form action={updateMemberAccess}><input type="hidden" name="user_id" value={m.user_id}/><select name="role" defaultValue={m.role}><option value="admin">Beheerder</option><option value="board">Bestuur</option><option value="member">Teamlid</option><option value="volunteer">Vrijwilliger</option></select><select name="status" defaultValue={m.status}><option value="pending">Wachtend</option><option value="active">Actief</option><option value="suspended">Geschorst</option></select><button type="submit">Opslaan</button></form></article>)}</div></div></AppShell>;
}
