import type { Capability } from "@/lib/permissions";

export const lifecycleEntities = {
  project: {
    table: "projects",
    label: "project",
    capability: "manageProjects",
    listPath: "/app/projecten",
    detailPath: "/app/projecten",
    archiveStatus: "archived",
  },
  event: {
    table: "events",
    label: "event",
    capability: "manageEvents",
    listPath: "/app/events",
    detailPath: "/app/events",
    archiveStatus: "archived",
  },
  content: {
    table: "content_items",
    label: "contentitem",
    capability: "manageContent",
    listPath: "/app/content",
    detailPath: "/app/content",
    archiveStatus: "archived",
  },
  partner: {
    table: "partners",
    label: "partner",
    capability: "manageOrganization",
    listPath: "/app/sponsors",
    detailPath: "/app/sponsors",
    archiveStatus: "archived",
  },
  campaign: {
    table: "campaigns",
    label: "campagne",
    capability: "manageOrganization",
    listPath: "/app/campagnes",
    detailPath: "/app/campagnes",
    archiveStatus: "archived",
  },
  communityPerson: {
    table: "community_people",
    label: "communityprofiel",
    capability: "manageOrganization",
    listPath: "/app/community",
    detailPath: "/app/community",
    archiveStatus: "archived",
  },
  socialPost: {
    table: "social_posts",
    label: "social post",
    capability: "manageOrganization",
    listPath: "/app/social",
    detailPath: "/app/social",
    archiveStatus: "archived",
  },
  meeting: {
    table: "meetings",
    label: "vergadering",
    capability: "manageOrganization",
    listPath: "/app/vergaderingen",
    detailPath: "/app/vergaderingen",
    archiveStatus: "archived",
  },
  knowledgeArticle: {
    table: "knowledge_articles",
    label: "kennisartikel",
    capability: "manageOrganization",
    listPath: "/app/kennisbank",
    detailPath: "/app/kennisbank",
    archiveStatus: "archived",
  },
} as const satisfies Record<string, {
  table: string;
  label: string;
  capability: Capability;
  listPath: string;
  detailPath: string;
  archiveStatus: string;
}>;

export type LifecycleEntity = keyof typeof lifecycleEntities;

