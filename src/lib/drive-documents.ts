export type DriveDocument = {
  id: string;
  title: string;
  source: string;
  sourceLabel: string;
  sourceHref: string;
  driveUrl: string | null;
  status: string;
  updatedAt: string;
};

export const driveSourceLabels: Record<string, string> = {
  project: "Project",
  content: "Content",
  event: "Event",
  sponsor: "Sponsor",
  campaign: "Campagne",
  community: "Community",
  knowledge: "Kennisbank",
  administration: "VZW-administratie",
  meeting: "Vergadering",
  launch: "Shoplancering",
};

export function makeDriveDocument(input: Omit<DriveDocument, "sourceLabel">): DriveDocument {
  return { ...input, sourceLabel: driveSourceLabels[input.source] ?? "Overige" };
}

export function filterDriveDocuments(
  documents: DriveDocument[],
  query: string,
  source: string,
  linkState: "all" | "linked" | "missing",
) {
  const needle = query.trim().toLocaleLowerCase("nl-BE");
  return documents
    .filter((document) => source === "all" || document.source === source)
    .filter((document) => linkState === "all" || (linkState === "linked" ? Boolean(document.driveUrl) : !document.driveUrl))
    .filter((document) => !needle || `${document.title} ${document.sourceLabel} ${document.status}`.toLocaleLowerCase("nl-BE").includes(needle))
    .sort((left, right) => {
      if (Boolean(left.driveUrl) !== Boolean(right.driveUrl)) return left.driveUrl ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
}

export function driveCoverage(documents: DriveDocument[]) {
  const linked = documents.filter((document) => document.driveUrl).length;
  return {
    total: documents.length,
    linked,
    missing: documents.length - linked,
    percentage: documents.length ? Math.round((linked / documents.length) * 100) : 0,
  };
}

export type GeneratedDocumentRecord = {
  id: string;
  entityId: string;
  documentLinkId: string | null;
  title: string;
  module: "projects" | "meetings" | "events" | "campaigns" | "sponsors";
  moduleLabel: string;
  documentType: "minutes" | "event_dossier" | "sponsor_report" | "linked_document";
  documentTypeLabel: string;
  status: "available" | "missing";
  sourceStatus: string;
  sourceHref: string;
  driveUrl: string | null;
  updatedAt: string;
};

export const documentModuleLabels = {
  projects: "Projecten",
  meetings: "Vergaderingen",
  events: "Events",
  campaigns: "Campagnes",
  sponsors: "Sponsors",
} as const;

export const generatedDocumentTypeLabels = {
  minutes: "Notulen",
  event_dossier: "Eventdossier",
  sponsor_report: "Sponsorrapport",
  linked_document: "Gekoppeld document",
} as const;

export function filterGeneratedDocuments(
  documents: GeneratedDocumentRecord[],
  filters: {
    query: string;
    module: string;
    documentType: string;
    status: string;
  },
) {
  const needle = filters.query.trim().toLocaleLowerCase("nl-BE");
  return documents
    .filter((document) => filters.module === "all" || document.module === filters.module)
    .filter((document) => filters.documentType === "all" || document.documentType === filters.documentType)
    .filter((document) => filters.status === "all" || document.status === filters.status)
    .filter((document) =>
      !needle ||
      `${document.title} ${document.moduleLabel} ${document.documentTypeLabel} ${document.sourceStatus}`
        .toLocaleLowerCase("nl-BE")
        .includes(needle),
    )
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "missing" ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
}
