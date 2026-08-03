export const communityRoleLabels = {
  member: "Lid",
  board: "Bestuurslid",
  volunteer: "Vrijwilliger",
  creator: "Creator",
  streamer: "Streamer",
  moderator: "Moderator",
  staff: "Medewerker",
  contact: "Contactpersoon",
  guest: "Gast",
} as const;

export type CommunityRole = keyof typeof communityRoleLabels;
