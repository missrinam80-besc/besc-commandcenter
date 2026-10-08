export const giveawaySources = { own: "Eigen voorraad", supplied: "Sponsor of partner", purchased: "Aangekocht" } as const;
export const giveawayStatuses = { needed: "Nog te regelen", arranged: "Geregeld", received: "Ontvangen", distributing: "In uitdeling", completed: "Afgerond", cancelled: "Vervallen" } as const;
export type EventGiveaway = {
  id: string; name: string; quantity_planned: number; quantity_received: number | null; quantity_distributed: number | null;
  source: keyof typeof giveawaySources; provider: string | null; responsible_person_id: string | null;
  status: keyof typeof giveawayStatuses; notes: string | null;
};
export function giveawayRemaining(item: Pick<EventGiveaway, "quantity_received" | "quantity_distributed">): number | null {
  return item.quantity_received === null || item.quantity_distributed === null ? null : item.quantity_received - item.quantity_distributed;
}
