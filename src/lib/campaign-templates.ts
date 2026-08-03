export const campaignTemplates = {
  social: {
    label: "Social campagne",
    briefing: "## Doel\n\n## Doelgroep\n\n## Kernboodschap\n\n## Planning\n\n## Benodigde assets\n",
    deliverables: ["Campagnecopy", "Visuals", "Publicatieplanning", "Resultatenrapport"],
    evaluation: "## Resultaten\n\n## Wat werkte goed?\n\n## Wat verbeteren we?\n\n## Vervolgacties\n",
    channels: ["Instagram", "Facebook", "Discord"],
  },
  partner: {
    label: "Partnercampagne",
    briefing: "## Doel van de samenwerking\n\n## Partnerafspraken\n\n## Doelgroep\n\n## Kernboodschap\n\n## Planning\n",
    deliverables: ["Partnerbriefing", "Contentpakket", "Goedkeuring partner", "Partnerresultatenrapport"],
    evaluation: "## Bereik en waarde\n\n## Feedback partner\n\n## Leerpunten\n\n## Vervolgafspraak\n",
    channels: ["Discord", "Instagram", "LinkedIn"],
  },
  sponsor: {
    label: "Sponsoractivatie",
    briefing: "## Campagnedoel\n\n## Sponsorverplichtingen\n\n## BESC-verplichtingen\n\n## Doelgroep\n\n## Timing en goedkeuring\n",
    deliverables: ["Sponsorbriefing", "Sponsorvermeldingen", "Bewijsstukken", "Sponsorrapport"],
    evaluation: "## Geleverde sponsorwaarde\n\n## Bereik en interactie\n\n## Bewijsstukken\n\n## Evaluatie en vervolg\n",
    channels: ["Twitch", "Discord", "Instagram", "LinkedIn"],
  },
  giveaway: {
    label: "Giveaway",
    briefing: "## Prijs en voorwaarden\n\n## Deelnamecriteria\n\n## Looptijd\n\n## Trekking en communicatie\n\n## Privacy en opvolging\n",
    deliverables: ["Wedstrijdreglement", "Promotiecontent", "Winnaarselectie", "Prijsafhandeling"],
    evaluation: "## Deelnames\n\n## Bereik en groei\n\n## Afhandeling winnaar\n\n## Leerpunten\n",
    channels: ["Discord", "Instagram", "Twitch"],
  },
  crowdfunding: {
    label: "Crowdfunding",
    briefing: "## Financieringsdoel\n\n## Bestemming van de middelen\n\n## Doelgroepen\n\n## Tegenprestaties\n\n## Communicatieplanning\n",
    deliverables: ["Campagnepagina", "Promotiecontent", "Voortgangsupdates", "Financieel eindrapport"],
    evaluation: "## Opgehaald bedrag\n\n## Conversie en bereik\n\n## Tegenprestaties\n\n## Financiële verantwoording\n",
    channels: ["Website", "Discord", "Instagram", "LinkedIn"],
  },
  event_promo: {
    label: "Eventpromo",
    briefing: "## Event en doel\n\n## Doelgroep\n\n## Belangrijkste momenten\n\n## Ticket- of inschrijvingsflow\n\n## Communicatieplanning\n",
    deliverables: ["Aankondiging", "Reminderreeks", "Eventdagcommunicatie", "Recap"],
    evaluation: "## Inschrijvingen en opkomst\n\n## Contentresultaten\n\n## Feedback\n\n## Verbeterpunten\n",
    channels: ["Discord", "Instagram", "Facebook", "Eventbrite"],
  },
  stream: {
    label: "Streamactivatie",
    briefing: "## Streamconcept\n\n## Hosts en deelnemers\n\n## Run of show\n\n## Branding en sponsoritems\n\n## Technische vereisten\n",
    deliverables: ["Streambriefing", "Run of show", "Overlays en assets", "Streamrapport"],
    evaluation: "## Kijkers en kijktijd\n\n## Interactie\n\n## Technische evaluatie\n\n## Highlights en vervolgcontent\n",
    channels: ["Twitch", "Discord", "YouTube"],
  },
  blog: {
    label: "Blogcampagne",
    briefing: "## Onderwerp en invalshoek\n\n## Doelgroep\n\n## Bronnen en interviews\n\n## SEO en kernwoorden\n\n## Publicatieplanning\n",
    deliverables: ["Onderzoek", "Conceptartikel", "Redactie en goedkeuring", "Publicatie en distributie"],
    evaluation: "## Lezers en kliks\n\n## Distributieresultaten\n\n## Inhoudelijke leerpunten\n\n## Vervolgcontent\n",
    channels: ["Blogger", "Website", "Discord", "LinkedIn"],
  },
} as const;

export type CampaignTemplateType = keyof typeof campaignTemplates;
