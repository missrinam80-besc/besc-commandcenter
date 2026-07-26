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
