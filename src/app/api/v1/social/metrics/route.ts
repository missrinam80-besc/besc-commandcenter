import { createExportRateLimiter, handleSocialMetricsExport } from "@/lib/social-metrics-export";
import { readSocialMetricsExportPage } from "@/lib/social-metrics-export-query";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const allowRequest = createExportRateLimiter();

export async function GET(request: Request) {
  return handleSocialMetricsExport(request, {
    apiKey: process.env.SOCIAL_EXPORT_API_KEY,
    organizationId: process.env.SOCIAL_EXPORT_ORGANIZATION_ID,
    forbiddenKeys: [process.env.CRON_SECRET, process.env.SUPABASE_SECRET_KEY],
    readPage: (query) => readSocialMetricsExportPage(createAdminClient(), query),
    allowRequest,
  });
}
