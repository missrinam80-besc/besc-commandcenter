export const auditActions = {
  created: "aangemaakt",
  updated: "bijgewerkt",
  archived: "gearchiveerd",
  deleted: "verwijderd",
} as const;

export type AuditAction = keyof typeof auditActions;

export const auditEntityGroups = {
  work: {
    label: "Werk",
    tables: ["inbox_items", "tasks", "projects"],
  },
  content: {
    label: "Content & communicatie",
    tables: ["content_items", "events", "campaigns", "campaign_deliverables", "social_posts", "social_post_variants", "approval_requests"],
  },
  relations: {
    label: "Relaties & community",
    tables: ["partners", "community_people", "organization_members"],
  },
  governance: {
    label: "Bestuur & administratie",
    tables: [
      "meetings",
      "meeting_action_items",
      "administrative_documents",
      "association_members",
      "governance_mandates",
      "compliance_deadlines",
    ],
  },
  finance: {
    label: "Financiën",
    tables: [
      "budget_envelopes",
      "expenses",
      "income_entries",
      "financial_documents",
    ],
  },
  knowledge: {
    label: "Kennis & rapportage",
    tables: ["knowledge_articles", "knowledge_categories", "kpi_records"],
  },
  system: {
    label: "Shop & systeem",
    tables: [
      "shop_products",
      "merch_launches",
      "integration_connections",
      "social_accounts",
      "social_sync_runs",
      "ai_prompt_templates",
    ],
  },
} as const;

export type AuditGroup = keyof typeof auditEntityGroups;

export const auditEntityLabels: Record<string, string> = {
  organization_members: "Gebruiker",
  inbox_items: "Inboxitem",
  tasks: "Taak",
  projects: "Project",
  content_items: "Contentitem",
  events: "Event",
  campaigns: "Campagne",
  campaign_deliverables: "Campagneoplevering",
  partners: "Partner",
  community_people: "Communityprofiel",
  social_posts: "Social post",
  social_post_variants: "Social kanaalvariant",
  approval_requests: "Goedkeuringsaanvraag",
  meetings: "Vergadering",
  meeting_action_items: "Actiepunt",
  shop_products: "Shopproduct",
  merch_launches: "Merchlancering",
  budget_envelopes: "Budget",
  expenses: "Kost",
  income_entries: "Inkomst",
  financial_documents: "Financieel document",
  administrative_documents: "Administratief document",
  association_members: "VZW-lid",
  governance_mandates: "Mandaat",
  compliance_deadlines: "Wettelijke deadline",
  knowledge_articles: "Kennisartikel",
  knowledge_categories: "Kenniscategorie",
  kpi_records: "KPI",
  integration_connections: "Integratie",
  social_accounts: "Social account",
  social_sync_runs: "Social synchronisatie",
  ai_prompt_templates: "AI-template",
};

const auditRoutes: Record<string, string> = {
  inbox_items: "/app/inbox",
  tasks: "/app/taken",
  projects: "/app/projecten",
  content_items: "/app/content",
  events: "/app/events",
  campaigns: "/app/campagnes",
  partners: "/app/sponsors",
  community_people: "/app/community",
  social_posts: "/app/social",
  meetings: "/app/vergaderingen",
  shop_products: "/app/shop/producten",
  merch_launches: "/app/shop/lanceringen",
  budget_envelopes: "/app/financien/budgetten",
  expenses: "/app/financien/kosten",
  income_entries: "/app/financien/inkomsten",
  administrative_documents: "/app/administratie",
  knowledge_articles: "/app/kennisbank",
  kpi_records: "/app/rapportage",
  social_accounts: "/app/integraties/social",
  social_sync_runs: "/app/integraties/social",
};

export function auditEntityHref(
  entityType: string,
  entityId: string,
  action: AuditAction,
  metadata?: Record<string, unknown> | null,
) {
  if (entityType === "campaign_deliverables") {
    if (action === "archived" || action === "deleted") return null;
    const campaign = metadata?.campaign_id;
    return typeof campaign === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(campaign)
      ? `/app/campagnes/${campaign}?tab=deliverables` : "/app/campagnes";
  }
  const route = auditRoutes[entityType];
  if (!route || action === "archived" || action === "deleted") return null;
  if (
    entityType === "inbox_items" ||
    entityType === "administrative_documents" ||
    entityType === "social_accounts" ||
    entityType === "social_sync_runs"
  ) {
    return route;
  }
  return `${route}/${entityId}`;
}

export function auditGroupTables(group?: string) {
  if (!group || !(group in auditEntityGroups)) return null;
  return auditEntityGroups[group as AuditGroup].tables;
}

export function describeChangedFields(fields: string[]) {
  if (!fields.length) return null;
  const labels: Record<string, string> = {
    status: "status",
    title: "titel",
    name: "naam",
    description: "beschrijving",
    priority: "prioriteit",
    due_at: "deadline",
    due_date: "deadline",
    deadline: "deadline",
    owner_id: "eigenaar",
    project_id: "projectkoppeling",
    assignee: "toewijzing",
    comment: "reactie",
    approval_status: "goedkeuringsstatus",
    community_person_id: "verantwoordelijke persoon",
    campaign_id: "campagnekoppeling",
  };
  return fields.slice(0, 4).map((field) => labels[field] ?? field.replaceAll("_", " ")).join(", ");
}

export function auditStatusLabel(entityType: string, status: string | null) {
  if (!status) return "—";
  const labels: Record<string, string> = {todo: "Te doen", doing: "Bezig", review: "In review", approved: "Goedgekeurd", completed: "Afgerond", blocked: "Geblokkeerd", cancelled: "Geannuleerd"};
  return entityType === "campaign_deliverables" && Object.hasOwn(labels, status) ? labels[status] : status;
}

export function auditApprovalTransition(entityType: string, metadata?: Record<string, unknown> | null) {
  if (entityType !== "campaign_deliverables") return null;
  const before = metadata?.previous_approval_status, after = metadata?.new_approval_status;
  const labels: Record<string, string> = {not_required: "Geen goedkeuring", pending: "Wacht op goedkeuring", changes_requested: "Aanpassingen nodig", approved: "Goedgekeurd"};
  if (typeof before !== "string" || typeof after !== "string" || before === after || !Object.hasOwn(labels, before) || !Object.hasOwn(labels, after)) return null;
  return `${labels[before]} → ${labels[after]}`;
}
