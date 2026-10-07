"use client";

import { useState } from "react";
import { financeRoleLabels, organizationRoleLabels, organizationRoles, type FinanceRole, type OrganizationRole } from "@/lib/permissions";

export function MemberRoleFields({ role: initialRole, financeRole }: { role: OrganizationRole; financeRole: FinanceRole }) {
  const [role, setRole] = useState(initialRole);
  const [approver, setApprover] = useState(["approver", "approver_treasurer"].includes(financeRole));
  const [bookkeeper, setBookkeeper] = useState(["treasurer", "approver_treasurer"].includes(financeRole));
  const supportsFunctions = role === "board" || role === "admin";
  const selectedFinance = supportsFunctions
    ? approver && bookkeeper ? "approver_treasurer" : approver ? "approver" : bookkeeper ? "treasurer" : financeRole === "submitter" && role === initialRole ? "submitter" : "none"
    : role === initialRole ? financeRole : "none";
  return <>
    <label><span>Rol</span><select name="role" value={role} onChange={event => setRole(event.target.value as OrganizationRole)}>
      {organizationRoles.map(value => <option key={value} value={value}>{organizationRoleLabels[value]}</option>)}
    </select></label>
    <input type="hidden" name="finance_role" value={selectedFinance}/>
    {supportsFunctions ? <fieldset className="board-function-picker"><legend>Bestuursfuncties</legend>
      <label><input type="checkbox" checked={approver} onChange={event => setApprover(event.target.checked)}/>Goedkeurder</label>
      <label><input type="checkbox" checked={bookkeeper} onChange={event => setBookkeeper(event.target.checked)}/>Boekhouder</label>
    </fieldset> : selectedFinance !== "none" ? <span className="field-help">Bestaande functie: {financeRoleLabels[financeRole]}</span> : null}
  </>;
}
