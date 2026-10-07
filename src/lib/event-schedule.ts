export const scheduleKinds = { program: "Programma", stream: "Stream", runbook: "Draaiboek", shift: "Crew / vrijwilliger" } as const;
export const scheduleStatuses = { draft: "Voorstel", confirmed: "Bevestigd", completed: "Uitgevoerd", cancelled: "Vervallen" } as const;
export type EventScheduleItem = {
  id: string; title: string; kind: keyof typeof scheduleKinds; status: keyof typeof scheduleStatuses;
  starts_at: string | null; ends_at: string | null; person_id: string | null;
  location: string | null; notes: string | null;
};

// Adjacent shifts are allowed. Cancelled or untimed entries cannot establish a conflict.
export function scheduleConflicts(rows: EventScheduleItem[]): Set<string> {
  const conflicts = new Set<string>();
  const timed = rows.filter(row => row.person_id && row.starts_at && row.ends_at && row.status !== "cancelled");
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
    const a = timed[i], b = timed[j];
    if (a.person_id === b.person_id && Date.parse(a.starts_at!) < Date.parse(b.ends_at!) && Date.parse(b.starts_at!) < Date.parse(a.ends_at!)) {
      conflicts.add(a.id); conflicts.add(b.id);
    }
  }
  return conflicts;
}
