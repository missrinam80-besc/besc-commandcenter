import type { SupabaseClient } from "@supabase/supabase-js";
import type { Capability } from "@/lib/permissions";

export const dossierEntityTypes = [
  "project",
  "event",
  "campaign",
  "content",
  "partner",
  "community_person",
  "task",
] as const;

export type DossierEntityType = (typeof dossierEntityTypes)[number];

type EntityConfig = {
  label: string;
  pluralLabel: string;
  table: string;
  titleColumn: string;
  route: string;
  capability: Capability;
};

export const dossierEntityConfig: Record<DossierEntityType, EntityConfig> = {
  project: { label: "Project", pluralLabel: "Projecten", table: "projects", titleColumn: "title", route: "/app/projecten", capability: "manageProjects" },
  event: { label: "Event", pluralLabel: "Events", table: "events", titleColumn: "title", route: "/app/events", capability: "manageEvents" },
  campaign: { label: "Campagne", pluralLabel: "Campagnes", table: "campaigns", titleColumn: "title", route: "/app/campagnes", capability: "manageOrganization" },
  content: { label: "Content", pluralLabel: "Content", table: "content_items", titleColumn: "title", route: "/app/content", capability: "manageContent" },
  partner: { label: "Sponsor of partner", pluralLabel: "Sponsors en partners", table: "partners", titleColumn: "name", route: "/app/sponsors", capability: "manageOrganization" },
  community_person: { label: "Persoon", pluralLabel: "Personen", table: "community_people", titleColumn: "display_name", route: "/app/community", capability: "manageOrganization" },
  task: { label: "Taak", pluralLabel: "Taken", table: "tasks", titleColumn: "title", route: "/app/taken", capability: "manageProjects" },
};

export const relationshipTypeLabels: Record<string, string> = {
  related: "Gerelateerd aan",
  part_of: "Onderdeel van",
  supports: "Ondersteunt",
  sponsor: "Sponsor van",
  participant: "Betrokken bij",
  supplier: "Leverancier voor",
};

export type RecordLink = {
  id: string;
  label: string;
  url: string;
  link_type: string;
};

export type RecordDocument = {
  id: string;
  name: string;
  web_url: string;
  mime_type: string | null;
  updated_at: string;
};

export type ResolvedRelationship = {
  id: string;
  relationship_type: string;
  entityType: DossierEntityType;
  entityId: string;
  label: string;
  href: string;
};

export type RelationOption = {
  entityType: DossierEntityType;
  entityId: string;
  label: string;
  group: string;
};

type RelationshipRow = {
  id: string;
  source_type: DossierEntityType;
  source_id: string;
  target_type: DossierEntityType;
  target_id: string;
  relationship_type: string;
};

type NamedRow = { id: string; [key: string]: unknown };

export function dossierPath(entityType: DossierEntityType, entityId: string) {
  return `${dossierEntityConfig[entityType].route}/${entityId}`;
}

export async function loadDossierConnections(
  supabase: SupabaseClient,
  organizationId: string,
  entityType: DossierEntityType,
  entityId: string,
) {
  const [{ data: linkRows }, { data: documentRows }, { data: relationshipRows }] = await Promise.all([
    supabase
      .from("record_links")
      .select("id,label,url,link_type")
      .eq("organization_id", organizationId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("position")
      .order("created_at"),
    supabase
      .from("google_resource_links")
      .select("id,name,web_url,mime_type,updated_at")
      .eq("organization_id", organizationId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("resource_type", "document")
      .order("updated_at", { ascending: false }),
    supabase
      .from("record_relationships")
      .select("id,source_type,source_id,target_type,target_id,relationship_type")
      .eq("organization_id", organizationId)
      .or(`and(source_type.eq.${entityType},source_id.eq.${entityId}),and(target_type.eq.${entityType},target_id.eq.${entityId})`)
      .order("created_at"),
  ]);

  const relationships = (relationshipRows ?? []) as RelationshipRow[];
  const counterparts = relationships.map((relation) => relation.source_type === entityType && relation.source_id === entityId
    ? { type: relation.target_type, id: relation.target_id }
    : { type: relation.source_type, id: relation.source_id });
  const idsByType = new Map<DossierEntityType, Set<string>>();
  for (const counterpart of counterparts) {
    const ids = idsByType.get(counterpart.type) ?? new Set<string>();
    ids.add(counterpart.id);
    idsByType.set(counterpart.type, ids);
  }

  const names = new Map<string, string>();
  await Promise.all([...idsByType.entries()].map(async ([type, ids]) => {
    const config = dossierEntityConfig[type];
    const { data } = await supabase
      .from(config.table)
      .select(`id,${config.titleColumn}`)
      .eq("organization_id", organizationId)
      .in("id", [...ids]);
    for (const row of (data ?? []) as unknown as NamedRow[]) {
      names.set(`${type}:${row.id}`, String(row[config.titleColumn] ?? config.label));
    }
  }));

  const resolved: ResolvedRelationship[] = relationships.map((relation, index) => {
    const counterpart = counterparts[index];
    return {
      id: relation.id,
      relationship_type: relation.relationship_type,
      entityType: counterpart.type,
      entityId: counterpart.id,
      label: names.get(`${counterpart.type}:${counterpart.id}`) ?? `${dossierEntityConfig[counterpart.type].label} (niet meer beschikbaar)`,
      href: dossierPath(counterpart.type, counterpart.id),
    };
  });

  return {
    links: (linkRows ?? []) as RecordLink[],
    relationships: resolved,
    documents: (documentRows ?? []) as RecordDocument[],
  };
}

export async function loadRelationOptions(
  supabase: SupabaseClient,
  organizationId: string,
  excludeType: DossierEntityType,
  excludeId: string,
) {
  const entries = await Promise.all(dossierEntityTypes.map(async (type) => {
    const config = dossierEntityConfig[type];
    let query = supabase
      .from(config.table)
      .select(`id,${config.titleColumn}`)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .neq("status", "archived")
      .order(config.titleColumn)
      .limit(250);
    if (type === excludeType) query = query.neq("id", excludeId);
    const { data } = await query;
    return ((data ?? []) as unknown as NamedRow[]).map((row): RelationOption => ({
      entityType: type,
      entityId: row.id,
      label: String(row[config.titleColumn] ?? config.label),
      group: config.pluralLabel,
    }));
  }));
  return entries.flat();
}
