export const registrationModes = { none: "Zonder inschrijvingen", external: "Externe inschrijfpagina", internal: "Eigen deelnemerslijst" } as const;
export const registrationStatuses = { registered: "Ingeschreven", waitlist: "Wachtlijst", attended: "Aanwezig", cancelled: "Geannuleerd" } as const;
export type EventRegistration = { id: string; name: string; quantity: number; status: keyof typeof registrationStatuses; notes: string | null };
export function registrationCounts(rows: EventRegistration[]) {
  return {
    reserved: rows.filter(row => ["registered", "attended"].includes(row.status)).reduce((sum, row) => sum + row.quantity, 0),
    waiting: rows.filter(row => row.status === "waitlist").reduce((sum, row) => sum + row.quantity, 0),
    attended: rows.filter(row => row.status === "attended").reduce((sum, row) => sum + row.quantity, 0),
  };
}
