export const newsletterVariants = ["besc", "event", "partner", "compact"] as const;

export type NewsletterVariant = (typeof newsletterVariants)[number];

export const newsletterVariantLabels: Record<NewsletterVariant, string> = {
  besc: "BESC nieuws",
  event: "Eventuitnodiging",
  partner: "Partnerupdate",
  compact: "Korte update",
};

const palette: Record<NewsletterVariant, { accent: string; secondary: string; background: string }> = {
  besc: { accent: "#d9232e", secondary: "#f6c945", background: "#f4f4f2" },
  event: { accent: "#121212", secondary: "#f6c945", background: "#f4f4f2" },
  partner: { accent: "#b51f29", secondary: "#ee8b2d", background: "#f7f4ee" },
  compact: { accent: "#252525", secondary: "#d9232e", background: "#f4f4f2" },
};

export function safeNewsletterImageUrl(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textBlocks(value: string) {
  return value.trim().split(/\n\s*\n/).filter(Boolean).map((block) => {
    const lines = block.split(/\r?\n/).map((line) => escapeHtml(line));
    const isList = lines.every((line) => /^[-*]\s+/.test(line));
    if (isList) {
      const items = lines.map((line) => `<li style="margin:0 0 8px">${line.replace(/^[-*]\s+/, "")}</li>`).join("");
      return `<ul style="margin:0 0 20px;padding-left:22px">${items}</ul>`;
    }
    return `<p style="margin:0 0 20px;line-height:1.65">${lines.join("<br>")}</p>`;
  }).join("");
}

export function newsletterHtml(input: {
  title: string;
  preheader?: string | null;
  bodyText: string;
  variant?: NewsletterVariant | null;
  organizationName?: string | null;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  unsubscribeUrl?: string | null;
}) {
  const variant = input.variant && newsletterVariants.includes(input.variant) ? input.variant : "besc";
  const colors = palette[variant];
  const hero = safeNewsletterImageUrl(input.heroImageUrl);
  const title = escapeHtml(input.title);
  const organization = escapeHtml(input.organizationName?.trim() || "BESC vzw");
  const preheader = escapeHtml(input.preheader?.trim() || input.title);
  const alt = escapeHtml(input.heroImageAlt?.trim() || input.title);
  const unsubscribe = input.unsubscribeUrl
    ? `<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#666;text-decoration:underline">Uitschrijven</a>`
    : "Antwoord op deze e-mail met ‘uitschrijven’ om geen berichten meer te ontvangen.";

  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${colors.background};color:#202020;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${colors.background};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e5e2dc">
<tr><td style="height:8px;background:${colors.secondary};font-size:0">&nbsp;</td></tr>
<tr><td style="padding:28px 36px 20px;background:${colors.accent};color:#fff"><div style="font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${organization}</div><h1 style="margin:10px 0 0;font-size:30px;line-height:1.2">${title}</h1></td></tr>
${hero ? `<tr><td><img src="${escapeHtml(hero)}" alt="${alt}" width="680" style="display:block;width:100%;max-width:680px;height:auto;border:0"></td></tr>` : ""}
<tr><td style="padding:${variant === "compact" ? "28px 36px" : "36px"};font-size:16px;line-height:1.65">${textBlocks(input.bodyText)}</td></tr>
<tr><td style="padding:22px 36px;background:#f8f7f4;border-top:1px solid #e8e5df;color:#666;font-size:12px;line-height:1.6"><strong style="color:#333">${organization}</strong><br>${unsubscribe}</td></tr>
</table></td></tr></table></body></html>`;
}
