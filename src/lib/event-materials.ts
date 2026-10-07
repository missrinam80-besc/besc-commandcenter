export const materialSources = { own: "Eigen materiaal", borrowed: "Geleend", rented: "Gehuurd", provided: "Voorzien door partner of locatie" } as const;
export const materialStatuses = { needed: "Nog te regelen", arranged: "Geregeld", ready: "Klaar voor vertrek", in_use: "Op het event", returned: "Teruggebracht", cancelled: "Vervallen" } as const;
export type EventMaterial = {
  id: string; asset_id: string | null; name: string; quantity: number;
  source: keyof typeof materialSources; provider: string | null; responsible_person_id: string | null;
  location: string | null; pickup_at: string | null; return_at: string | null;
  status: keyof typeof materialStatuses; notes: string | null;
};
