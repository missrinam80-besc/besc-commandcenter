export const functionalAccountType = "functional_account";

export const communityProfileTypes = {
  crew: "Crew", streamer: "Streamer", creator: "Creator", volunteer: "Vrijwilliger",
  moderator: "Moderator", guest: "Gast", external: "Extern",
  functional_account: "Functioneel account",
} as const;

// Classification only: never use this to grant or revoke account permissions.
export function isNaturalPersonContact(person: { person_type?: string | null }) {
  return person.person_type !== functionalAccountType;
}

export const communityRoleLabels = {
  member: "Lid",
  board: "Bestuurslid",
  volunteer: "Vrijwilliger",
  creator: "Creator",
  streamteam: "Streamteam",
  moderator: "Moderator",
  staff: "Medewerker",
  contact: "Contactpersoon",
  guest: "Gast",
} as const;

export type CommunityRole = keyof typeof communityRoleLabels;
