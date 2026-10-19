import { handleRewardsPreviewRequest, parseRewardsPreviewRegistry } from "@/lib/rewards-integration-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  return handleRewardsPreviewRequest(request, {
    enabled: process.env.BESC_REWARDS_PREVIEW_ENABLED === "true",
    registry: () => parseRewardsPreviewRegistry(process.env.BESC_REWARDS_PREVIEW_REGISTRY_JSON),
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
