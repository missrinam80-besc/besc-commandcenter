export const socialPlatforms = ["youtube", "facebook", "instagram", "threads", "twitch", "linkedin", "tiktok", "x"] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

export const socialPlatformDefinitions: Record<SocialPlatform, {
  label: string;
  phase: string;
  capabilities: string[];
  state: "ready_for_pilot" | "planned" | "blocked";
}> = {
  youtube: { label: "YouTube", phase: "Eerste pilot", capabilities: ["Kanaaldata", "Videoanalytics"], state: "ready_for_pilot" },
  facebook: { label: "Facebook", phase: "Meta-pilot", capabilities: ["Publicatie", "Pagina-inzichten"], state: "planned" },
  instagram: { label: "Instagram", phase: "Meta-pilot", capabilities: ["Publicatie", "Media-inzichten"], state: "planned" },
  threads: { label: "Threads", phase: "Meta-pilot", capabilities: ["Publicatie", "Post-inzichten"], state: "planned" },
  twitch: { label: "Twitch", phase: "Operationele pilot", capabilities: ["Kanaaldata", "Planning"], state: "planned" },
  linkedin: { label: "LinkedIn", phase: "Na producttoegang", capabilities: ["Organisatieposts", "Analytics"], state: "blocked" },
  tiktok: { label: "TikTok", phase: "Na audit", capabilities: ["Direct Post"], state: "blocked" },
  x: { label: "X", phase: "Na budgetbesluit", capabilities: ["Publicatie", "Eigen metrics"], state: "blocked" },
};

export const socialAccountStatuses = ["pending", "connected", "expired", "error", "disabled", "disconnected"] as const;
export const socialSyncStatuses = ["queued", "running", "succeeded", "partial", "failed", "cancelled"] as const;
