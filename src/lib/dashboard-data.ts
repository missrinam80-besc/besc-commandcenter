import { createClient } from "@/lib/supabase/server";
import { demoDashboard } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import type { DashboardData } from "@/lib/types";

const statusLabels: Record<string, string> = { todo: "Te doen", doing: "Bezig", waiting: "Wachten", review: "Review", done: "Afgerond" };
const projectLabels: Record<string, string> = { idea: "Idee", planned: "Gepland", active: "Actief", blocked: "Geblokkeerd", done: "Afgerond" };
const roleLabels: Record<string, string> = { admin: "Beheerder", board: "Bestuur", member: "Teamlid", volunteer: "Vrijwilliger" };
type TaskRow = { id: string; title: string; status: string; priority: string; due_at: string | null; projects: { title: string } | null };

export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return demoDashboard;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return demoDashboard;
  const { data: memberships } = await supabase.from("organization_members").select("organization_id,role,status").eq("user_id", user.id).eq("status", "active").limit(1);
  const membership = memberships?.[0];
  if (!membership) return { ...demoDashboard, name: user.email?.split("@")[0] ?? "Gebruiker", role: "In afwachting", taskCount: 0, inboxCount: 0, projectCount: 0, notificationCount: 0, attentionCount: 0, tasks: [], inbox: [], projects: [] };
  const orgId = membership.organization_id;
  const [{ data: profile }, { data: tasks }, { data: projects }, { data: inbox }, { count: notificationCount }, { count: attentionCount }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("tasks").select("id,title,status,priority,due_at,projects(title)").eq("organization_id", orgId).is("deleted_at", null).neq("status", "done").order("due_at", { ascending: true, nullsFirst: false }).limit(3),
    supabase.from("projects").select("id,title,status,due_date").eq("organization_id", orgId).is("deleted_at", null).in("status", ["planned","active","blocked"]).limit(3),
    supabase.from("inbox_items").select("id,title,source,created_at").eq("organization_id", orgId).is("deleted_at", null).in("status", ["new","reviewing"]).order("created_at", { ascending: false }).limit(2),
    supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",user.id).is("read_at",null),
    supabase.from("tasks").select("id",{count:"exact",head:true}).eq("organization_id",orgId).is("deleted_at",null).lt("due_at",new Date().toISOString()).neq("status","done"),
  ]);
  return {
    name: profile?.display_name || user.email?.split("@")[0] || "Gebruiker", role: roleLabels[membership.role] || "Teamlid",
    taskCount: tasks?.length ?? 0, inboxCount: inbox?.length ?? 0, projectCount: projects?.length ?? 0, notificationCount: notificationCount??0, attentionCount: attentionCount??0,
    tasks: ((tasks ?? []) as unknown as TaskRow[]).map(t => ({ id: t.id, title: t.title, project: t.projects?.title ?? "Zonder project", due: t.due_at ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(t.due_at)) : "Geen deadline", priority: t.priority, status: statusLabels[t.status] ?? t.status })),
    inbox: (inbox ?? []).map(i => ({ id: i.id, title: i.title, source: i.source, created: new Intl.RelativeTimeFormat("nl").format(-Math.max(1, Math.round((Date.now() - new Date(i.created_at).getTime()) / 86400000)), "day") })),
    projects: (projects ?? []).map((p, index) => ({ id: p.id, name: p.title, progress: p.status === "active" ? 50 : 20, status: projectLabels[p.status] ?? p.status, due: p.due_date ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long" }).format(new Date(p.due_date)) : "Nog te plannen", color: ["#ef7f3b", "#7357d6", "#2f8f77"][index % 3] })),
  };
}
