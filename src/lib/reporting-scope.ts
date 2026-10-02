type RoleRow = { role?: string | null };

type PersonForReporting = {
  status?: string | null;
  person_type?: string | null;
  streamteam_level?: string | null;
  roles?: RoleRow[] | RoleRow | null;
};

const streamTeamTypes = new Set(["streamer"]);

export function isActiveStreamTeamMember(person: PersonForReporting) {
  const roles = Array.isArray(person.roles)
    ? person.roles
    : person.roles
      ? [person.roles]
      : [];
  const hasStreamTeamType = streamTeamTypes.has(String(person.person_type ?? ""));
  const hasStreamTeamRole = roles.some((role) => streamTeamTypes.has(String(role.role ?? "")));

  return person.status === "active"
    && Boolean(String(person.streamteam_level ?? "").trim())
    && (hasStreamTeamType || hasStreamTeamRole);
}

export function isActiveSponsor(partner: { partner_type?: string | null; status?: string | null }) {
  return partner.partner_type === "sponsor" && partner.status === "active";
}
