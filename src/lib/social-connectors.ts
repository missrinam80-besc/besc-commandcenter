export const socialPlatforms = ["youtube", "facebook", "instagram", "threads", "twitch", "linkedin", "tiktok", "x"] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

export const socialPlatformDefinitions: Record<SocialPlatform, {
  label: string;
  phase: string;
  capabilities: string[];
  state: "ready_for_pilot" | "planned" | "blocked";
  requirement?: string;
}> = {
  youtube: { label: "YouTube", phase: "Eerste pilot", capabilities: ["Kanaaldata", "Videoanalytics"], state: "ready_for_pilot" },
  facebook: { label: "Facebook", phase: "Meta-pilot", capabilities: ["Paginadata", "Pagina-inzichten"], state: "ready_for_pilot" },
  instagram: { label: "Instagram", phase: "Meta-pilot", capabilities: ["Accountdata", "Accountinzichten"], state: "ready_for_pilot" },
  threads: { label: "Threads", phase: "Meta-pilot", capabilities: ["Accountdata", "Accountinzichten"], state: "ready_for_pilot" },
  twitch: { label: "Twitch", phase: "Operationele pilot", capabilities: ["Live-status", "Kanaalplanning"], state: "ready_for_pilot" },
  linkedin: { label: "LinkedIn", phase: "Na producttoegang", capabilities: ["Organisatieposts", "Analytics"], state: "blocked", requirement: "Community Management-toegang door LinkedIn" },
  tiktok: { label: "TikTok", phase: "Na audit", capabilities: ["Direct Post"], state: "blocked", requirement: "Productgoedkeuring en audit door TikTok" },
  x: { label: "X", phase: "Na budgetbesluit", capabilities: ["Publicatie", "Eigen metrics"], state: "blocked", requirement: "Goedgekeurd API-budget en kostenlimiet" },
};

export const socialAccountStatuses = ["pending", "connected", "expired", "error", "disabled", "disconnected"] as const;
export const socialSyncStatuses = ["queued", "running", "succeeded", "partial", "failed", "cancelled"] as const;
