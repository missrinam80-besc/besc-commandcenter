import type { SocialPlatform } from "@/lib/social-connectors";

export type SocialAcceptancePlatform = Extract<SocialPlatform, "youtube" | "facebook" | "instagram" | "threads" | "twitch">;

export const socialAcceptancePlatforms: SocialAcceptancePlatform[] = ["youtube", "facebook", "instagram", "threads", "twitch"];

export const socialAcceptanceChecklist: Record<SocialAcceptancePlatform, string[]> = {
  youtube: [
    "OAuth-flow met het BESC-kanaal doorlopen",
    "Handmatige sync uitvoeren",
    "Kanaalstatistieken en YouTube Analytics-metingen controleren",
    "Socialrapportage en CSV-export valideren",
  ],
  facebook: [
    "Meta App met juiste Facebook-paginatoegang testen",
    "Handmatige sync uitvoeren",
    "Paginadata en pagina-inzichten controleren",
    "Socialrapportage en CSV-export valideren",
  ],
  instagram: [
    "Meta App met professioneel Instagram-account testen",
    "Handmatige sync uitvoeren",
    "Accountinzichten controleren",
    "Socialrapportage en CSV-export valideren",
  ],
  threads: [
    "Threads OAuth-flow doorlopen",
    "Handmatige sync uitvoeren",
    "Accountinzichten en tokenverlenging controleren",
    "Socialrapportage en CSV-export valideren",
  ],
  twitch: [
    "Twitch OAuth-flow doorlopen",
    "Handmatige sync uitvoeren",
    "Live-status en kanaalplanning controleren",
    "Socialrapportage en CSV-export valideren",
  ],
};

export const socialDecisionGates = [
  {
    platform: "LinkedIn",
    decision: "Later",
    reason: "Pas opnemen wanneer BESC toegang heeft tot de vereiste LinkedIn-producten voor organisatiebeheer en analytics.",
  },
  {
    platform: "TikTok",
    decision: "Later",
    reason: "Pas opnemen na productgoedkeuring, audit en duidelijke publicatie-/analyticsrechten.",
  },
  {
    platform: "X",
    decision: "Later",
    reason: "Pas opnemen na budgetbesluit voor API-toegang en interne kostenlimiet.",
  },
] as const;
