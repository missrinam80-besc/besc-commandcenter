"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { googleGmailConfiguration, saveGmailDraft, sendGmailDraft } from "@/lib/google-gmail";
import { createClient } from "@/lib/supabase/server";

const consentVersion = "besc-newsletter-v1-2026-08-03";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function requestNewsletterSubscription(formData: FormData) {
  const parsed = z.object({
    list_slug: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(320),
    display_name: z.string().trim().max(180).optional(),
    consent: z.literal("yes"),
    website: z.string().max(0).optional(),
  }).safeParse(Object.fromEntries(formData));
  const slug = String(formData.get("list_slug") ?? "nieuws").replace(/[^a-z0-9-]/gi, "").slice(0, 120) || "nieuws";
  if (!parsed.success) redirect(`/nieuwsbrief/${slug}?fout=velden`);

  const rawToken = randomBytes(32).toString("base64url");
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const supabase = await createClient();
  const { data: accepted } = await supabase.rpc("request_newsletter_subscription", {
    p_list_slug: parsed.data.list_slug,
    p_email: parsed.data.email.toLowerCase(),
    p_display_name: parsed.data.display_name || "",
    p_token_hash: hash(rawToken),
    p_ip_hash: hash(forwarded),
    p_consent_version: consentVersion,
  });

  if (accepted && googleGmailConfiguration().configured) {
    try {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
      if (!siteUrl) throw new Error("NEXT_PUBLIC_SITE_URL ontbreekt");
      const confirmationUrl = `${siteUrl}/nieuwsbrief/bevestigen?token=${encodeURIComponent(rawToken)}`;
      const draft = await saveGmailDraft({
        to: [parsed.data.email.toLowerCase()],
        subject: "Bevestig je inschrijving voor de BESC-nieuwsbrief",
        body: `Hallo${parsed.data.display_name ? ` ${parsed.data.display_name}` : ""},\n\nBevestig je inschrijving via deze eenmalige link:\n${confirmationUrl}\n\nDe link blijft 24 uur geldig. Heb je dit niet aangevraagd? Dan hoef je niets te doen.`,
      });
      await sendGmailDraft(draft.id);
    } catch {
      // De publieke respons blijft bewust generiek en lekt geen account- of configuratiestatus.
    }
  }
  redirect(`/nieuwsbrief/${slug}?aangevraagd=1`);
}
