import { cache } from "react";
import { requireActiveMembership } from "@/lib/auth-context";
import { type FinanceRole, type OrganizationRole, organizationRoleLabels } from "@/lib/permissions";

export const getAppShellContext = cache(async function getAppShellContext() {
  const { supabase, user, membership } = await requireActiveMembership();
  await supabase.rpc("refresh_my_notifications");
  let approvalCountQuery = supabase
    .from("approval_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id);
  if (membership.role === "admin" || membership.role === "board" || ["approver", "treasurer", "approver_treasurer"].includes(membership.finance_role)) {
    approvalCountQuery = approvalCountQuery.eq("status", "pending");
  } else {
    approvalCountQuery = approvalCountQuery.eq("requested_by", user.id).in("status", ["pending", "changes_requested"]);
  }
  const [{ data: profile }, { count: inboxCount }, { count: notificationCount }, { count: approvalCount }] = await Promise.all([
    supabase.from("profiles").select("display_name,theme_preference").eq("id", user.id).maybeSingle(),
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).is("deleted_at", null).in("status", ["new", "reviewing"]),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    approvalCountQuery,
  ]);

  const membershipRole = membership.role as OrganizationRole;
  const financeRole = membership.finance_role as FinanceRole;
  return {
    membershipRole, financeRole,
    name: profile?.display_name || user.email?.split("@")[0] || "Gebruiker",
    role: organizationRoleLabels[membershipRole] || "Crew",
    theme: profile?.theme_preference || "system",
    inboxCount: inboxCount ?? 0, notificationCount: notificationCount ?? 0, approvalCount: approvalCount ?? 0,
  };
 });

export type AppShellData = Awaited<ReturnType<typeof getAppShellContext>>;
