import { communityRoleLabels } from "./community-people.ts";

export type PersonPickerOption = { id: string; label: string; roles?: string[]; aliases?: string[] };

export function toPersonPickerOptions(rows: { id: string; display_name: string; handle: string | null; discord_handle: string | null; community_person_roles: { role: string }[] }[]): PersonPickerOption[] {
  return rows.map((person) => ({
    id: person.id,
    label: person.display_name,
    aliases: [person.handle, person.discord_handle].filter((value): value is string => Boolean(value)),
    roles: (person.community_person_roles ?? []).map(({ role }) => communityRoleLabels[role as keyof typeof communityRoleLabels] ?? role),
  }));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("nl-BE").replace(/@/g, "").trim();
}

export function filterPeople(options: PersonPickerOption[], query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return options.filter((person) => {
    const text = normalize([person.label, ...(person.aliases ?? []), ...(person.roles ?? [])].join(" "));
    return words.every((word) => text.includes(word));
  });
}
