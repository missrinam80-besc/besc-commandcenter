export type SourceObservation = {
  source_version?: string | null;
  source_modified_at?: string | null;
  source_checked_at?: string | null;
};

export function sourceObservation(input: { version?: unknown; modifiedTime?: unknown; checkedAt?: unknown }): SourceObservation {
  const timestamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;
  return {
    source_version: typeof input.version === "string" && /^[0-9]+$/.test(input.version) ? input.version : null,
    source_modified_at: timestamp(input.modifiedTime),
    source_checked_at: timestamp(input.checkedAt),
  };
}

export function sourceObservationLabels(source: SourceObservation) {
  const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(value))
    : "onbekend";
  return [
    `Drive-versie: ${source.source_version ?? "onbekend"}`,
    `Bron gewijzigd: ${date(source.source_modified_at)}`,
    `Metadata gecontroleerd: ${date(source.source_checked_at)}`,
  ].join(" · ");
}
