"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import { rewardSchemas, type RewardOperation } from "@/lib/rewards";

export async function saveRewardAction(form: FormData) {
  const { supabase, membership } = await requireActiveMembership();
  const op = String(form.get("operation") ?? "") as RewardOperation;
  const tab = ["overzicht", "catalogus", "aanvragen", "beheer", "regels", "historiek"].includes(String(form.get("return_tab"))) ? String(form.get("return_tab")) : "overzicht";
  const back = `/app/bucks?tab=${tab}`;
  if (!Object.hasOwn(rewardSchemas, op) || op === "activity") redirect(back + "&fout=invalid_fields");
  if (!["request", "cancel"].includes(op) && !hasPermission(membership, "manageRewards")) redirect(back + "&fout=rewards_forbidden");
  const text = (n: string) => String(form.get(n) ?? "");
  const num = (n: string) => text(n).trim() === "" ? NaN : Number(text(n));
  let data: Record<string, unknown>;
  switch (op) {
    case "grant": data = { user_id: text("user_id"), xp: num("xp"), bucks: num("bucks"), reason: text("reason") }; break;
    case "correct": data = { user_id: text("user_id"), entry_id: text("entry_id"), reason: text("reason") }; break;
    case "catalog_save": data = { ...(text("id") ? { id: text("id"), version: num("version") } : {}), title: text("title"), description: text("description"), price: num("price"), stock: text("stock").trim() ? num("stock") : null, active: form.has("active") }; break;
    case "rule_save": data = { guild_id: text("guild_id"), kind: text("kind"), channel_ids: text("channel_ids").split(/[\s,]+/).filter(Boolean), xp: num("xp"), bucks: num("bucks"), cooldown_seconds: num("cooldown_seconds"), daily_xp: num("daily_xp"), daily_bucks: num("daily_bucks"), enabled: false, version: num("version"), voice_min_participants: num("voice_min_participants"), exclude_muted: form.has("exclude_muted"), exclude_deafened: form.has("exclude_deafened"), exclude_afk: form.has("exclude_afk") }; break;
    case "levels_save": data = { version: num("version"), thresholds: text("thresholds").trim() ? text("thresholds").split(/[\s,]+/).filter(Boolean).map(Number) : [] }; break;
    case "request": data = { reward_id: text("reward_id"), version: num("version") }; break;
    case "cancel": case "fulfill": data = { id: text("id"), version: num("version") }; break;
    case "decide": data = { id: text("id"), version: num("version"), decision: text("decision"), reason: text("reason") }; break;
  }
  const parsed = rewardSchemas[op].safeParse(data!);
  if (!parsed.success) redirect(back + "&fout=invalid_fields&veld=" + encodeURIComponent(String(parsed.error.issues[0]?.path[0] ?? "")));
  const key = text("submission_id");
  if (!/^[0-9a-f-]{36}$/i.test(key)) redirect(back + "&fout=invalid_fields");
  const r = await supabase.rpc("rewards_web", { op, d: { ...parsed.data, organization_id: membership.organization_id }, k: key });
  revalidatePath("/app/bucks");
  redirect(back + (r.error ? "&fout=unavailable" : r.data?.error ? "&fout=" + encodeURIComponent(r.data.error) : "&opgeslagen=1"));
}
