type RoleRow = { role?: string | null };

type PersonForReporting = {
  status?: string | null;
  roles?: RoleRow[] | RoleRow | null;
};

export function isActiveStreamTeamMember(person: PersonForReporting) {
  const roles = Array.isArray(person.roles)
    ? person.roles
    : person.roles
      ? [person.roles]
      : [];
  return person.status === "active"
    && roles.some((role) => role.role === "streamteam");
}

export function isActiveSponsor(partner: { partner_type?: string | null; status?: string | null }) {
  return partner.partner_type === "sponsor" && partner.status === "active";
}
