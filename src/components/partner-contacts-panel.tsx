import Link from "next/link";
import { addPartnerContact, linkPartnerContact } from "@/app/app/operations/relation-actions";

type Row = { id: string; [key: string]: unknown };
type Option = { id: string; label: string };

export function PartnerContactsPanel({ partnerId, contacts, people, accounts, canManage, optionsError }: {
  partnerId: string; contacts: Row[]; people: Row[]; accounts: Option[]; canManage: boolean; optionsError: boolean;
}) {
  const accountSelect = (current: string = "") => <label>Gebruikersaccount<select name="account_user_id" defaultValue={current}>
    <option value="">Geen account gekoppeld</option>
    {current && !accounts.some(a => a.id === current) && <option value={current}>Eerder gekoppeld account</option>}
    {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
  </select></label>;
  const personSelect = (current: string = "") => <label>Bestaand contact<select name="community_person_id" defaultValue={current}>
    <option value="">Afzonderlijke contactpersoon</option>
    {current && !people.some(p => p.id === current) && <option value={current}>Eerder gekoppeld contact</option>}
    {people.map(p => <option key={p.id} value={p.id}>{String(p.display_name)}{p.email ? ` · ${p.email}` : ""}</option>)}
  </select></label>;
  return <section className="form-card">
    <div className="form-heading"><h2>Contactpersonen</h2><span>{contacts.length}</span></div>
    {optionsError && <p className="error-note" role="alert">Contacten of accounts konden niet geladen worden. Probeer opnieuw voordat je koppelingen wijzigt.</p>}
    <div className="relation-list">{contacts.map(c => {
      const person = people.find(p => p.id === c.community_person_id);
      const account = person?.account_user_id ?? c.account_user_id;
      return <article key={c.id}>
        <strong>{String(person?.display_name ?? c.name)}</strong>
        <span>{String(c.role_title ?? "")}{(person?.email ?? c.email) ? ` · ${person?.email ?? c.email}` : ""}{c.is_primary ? " · Primair" : ""}</span>
        {account ? <span>Account gekoppeld</span> : null}
        {c.community_person_id ? <Link href={`/app/community/${c.community_person_id}`}>Contactfiche en account openen</Link> : null}
        {canManage && !optionsError && <details><summary>Koppeling wijzigen</summary><form action={linkPartnerContact}>
          <input type="hidden" name="partner_id" value={partnerId}/><input type="hidden" name="contact_id" value={c.id}/>
          <div className="form-row">{personSelect(String(c.community_person_id ?? ""))}{c.community_person_id ? <input type="hidden" name="account_user_id" value=""/> : accountSelect(String(c.account_user_id ?? ""))}</div>
          <button className="secondary-button">Koppeling opslaan</button>
        </form></details>}
      </article>;
    })}</div>
    {canManage && !optionsError && <>
      <p className="form-help">Kies een bestaand contact, of vul hieronder een nieuwe contactpersoon in. Bij een bestaand contact beheer je het account op de contactfiche. Een koppeling geeft geen toegang.</p>
      <details><summary>Contactpersoon toevoegen</summary><form action={addPartnerContact}>
        <input type="hidden" name="partner_id" value={partnerId}/>
        <div className="form-row">{personSelect()}{accountSelect()}</div>
        <div className="form-row"><label>Naam (bij nieuw contact)<input name="name" maxLength={180}/></label><label>Functie bij sponsor<input name="role_title" maxLength={180}/></label><label>E-mail<input type="email" name="email"/></label><label>Telefoon<input name="phone" maxLength={50}/></label></div>
        <label className="inline-check"><input type="checkbox" name="is_primary"/>Primair contact</label>
        <button className="secondary-button">Contact toevoegen</button>
      </form></details>
    </>}
  </section>;
}
