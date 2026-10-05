import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { hasPermission } from "@/lib/permissions";
import { formatDate, formatDateTime, formatDateTimeLocal } from "@/lib/format";
import type { AttentionView, DashboardData, DashboardWidget, ScheduleView } from "@/lib/types";

const statusLabels:Record<string,string>={todo:"Te doen",doing:"Bezig",waiting:"Wachten",review:"Review",done:"Afgerond"};
const projectLabels:Record<string,string>={idea:"Idee",planned:"Gepland",active:"Actief",blocked:"Geblokkeerd",done:"Afgerond"};
const roleLabels:Record<string,string>={admin:"Beheerder",board:"Bestuur",member:"Teamlid",volunteer:"Vrijwilliger"};
type TaskRow={id:string;title:string;status:string;priority:string;due_at:string|null;created_by:string;projects:{title:string}|null;task_assignees:{user_id:string}[]};
type ProjectRow={id:string;title:string;status:string;due_date:string|null;owner_id:string|null;project_members:{user_id:string}[]};

function dateLabel(value:string|null,withTime=false){
  if(!value)return "Nog te plannen";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${formatDate(value)} · Tijd onbekend`;
  return withTime ? formatDateTime(value, "Nog te plannen") : new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" }).format(new Date(value));
}
function startOfToday(){const date=new Date();date.setHours(0,0,0,0);return date}

function unavailableDashboard(loadState: NonNullable<DashboardData["loadState"]>): DashboardData {
  return {
    loadState, name: "Gebruiker", role: "Niet beschikbaar", roleKey: "pending",
    taskCount: 0, inboxCount: 0, projectCount: 0, notificationCount: 0, attentionCount: 0,
    tasks: [], inbox: [], projects: [], attention: [], schedule: [], actionItems: [], widgets: [],
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return unavailableDashboard("not_configured");
  try {
    return await loadDashboardData();
  } catch {
    // Never expose database details or turn transport failures into empty work.
    return unavailableDashboard("unavailable");
  }
}

async function loadDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error) return unavailableDashboard("unavailable");
  const user = auth.data.user;
  if (!user) return unavailableDashboard("no_access");
  const membershipResult = await supabase.from("organization_members")
    .select("organization_id,role,status,finance_role").eq("user_id", user.id)
    .eq("status", "active").limit(1).maybeSingle();
  if (membershipResult.error) return unavailableDashboard("unavailable");
  const membership = membershipResult.data;
  if (!membership) return unavailableDashboard("no_access");
  const orgId=membership.organization_id;
  const manager=["admin","board"].includes(membership.role);
  const finance=hasPermission(membership,"viewFinance");
  const now=new Date(),today=startOfToday(),inFourteenDays=new Date(now.getTime()+14*86400000);

  const results=await Promise.all([
    supabase.from("profiles").select("display_name").eq("id",user.id).maybeSingle(),
    supabase.from("tasks").select("id,title,status,priority,due_at,created_by,projects(title),task_assignees(user_id)").eq("organization_id",orgId).is("deleted_at",null).not("status","in","(done,cancelled)").order("due_at",{ascending:true,nullsFirst:false}),
    supabase.from("projects").select("id,title,status,due_date,owner_id,project_members(user_id)").eq("organization_id",orgId).is("deleted_at",null).in("status",["planned","active","blocked"]).order("due_date",{ascending:true,nullsFirst:false}),
    manager?supabase.from("inbox_items").select("id,title,source,created_at").eq("organization_id",orgId).is("deleted_at",null).in("status",["new","reviewing"]).order("created_at",{ascending:false}).limit(4):Promise.resolve({data:[]}),
    supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",user.id).is("read_at",null),
    supabase.from("events").select("id,title,start_at,start_date,status,owner_id").eq("organization_id",orgId).is("deleted_at",null).gte("start_date",formatDateTimeLocal(now).slice(0,10)).lte("start_date",formatDateTimeLocal(inFourteenDays).slice(0,10)).not("status","in","(completed,cancelled,archived)").order("start_date").limit(5),
    manager?supabase.from("meetings").select("id,title,meeting_at,status").eq("organization_id",orgId).is("deleted_at",null).gte("meeting_at",now.toISOString()).not("status","in","(completed,cancelled,archived)").order("meeting_at").limit(5):Promise.resolve({data:[]}),
    manager?supabase.from("meeting_action_items").select("id,title,status,task_id,meeting_id,meetings(title)").eq("organization_id",orgId).in("status",["todo","doing"]).order("created_at",{ascending:false}):Promise.resolve({data:[]}),
    finance?supabase.from("expenses").select("id",{count:"exact",head:true}).eq("organization_id",orgId).is("deleted_at",null).in("status",["requested","reimbursement_due"]):Promise.resolve({count:0}),
    manager?supabase.from("compliance_deadlines").select("id",{count:"exact",head:true}).eq("organization_id",orgId).is("deleted_at",null).in("status",["open","planned"]).lte("due_date",inFourteenDays.toISOString().slice(0,10)):Promise.resolve({count:0}),
  ]);
  // Any failed required source makes the complete dashboard unavailable.
  // Null data/count without an explicit error is not evidence of a genuine zero.
  if (results.some(result => "error" in result && result.error)) {
    return unavailableDashboard("unavailable");
  }
  const listIndexes = [1, 2, 3, 5, 6, 7];
  const countIndexes = [4, 8, 9];
  if (listIndexes.some(index => !("data" in results[index]) || !Array.isArray(results[index].data))
    || countIndexes.some(index => !("count" in results[index]) || typeof results[index].count !== "number")) {
    return unavailableDashboard("unavailable");
  }
  const[
    {data:profile},{data:taskRows},{data:projectRows},{data:inboxRows},
    {count:notificationCount},{data:events},{data:meetings},{data:meetingActions},
    {count:pendingExpenses},{count:openCompliance},
  ]=results;


  const personalTasks=((taskRows??[]) as unknown as TaskRow[]).filter(task=>{
    const assignees=task.task_assignees??[];
    return assignees.some(item=>item.user_id===user.id)||(!assignees.length&&task.created_by===user.id);
  });
  const personalProjects=((projectRows??[]) as unknown as ProjectRow[]).filter(project=>project.owner_id===user.id||(project.project_members??[]).some(item=>item.user_id===user.id));
  const overdue=personalTasks.filter(task=>task.due_at&&new Date(task.due_at)<today);
  const waiting=personalTasks.filter(task=>["waiting","review"].includes(task.status));
  const blocked=personalProjects.filter(project=>project.status==="blocked");
  const attention:AttentionView[]=[
    ...overdue.slice(0,4).map(task=>({id:`task-${task.id}`,title:task.title,kind:"Achterstallige taak",detail:`Deadline ${dateLabel(task.due_at,true)}`,href:`/app/taken/${task.id}`,severity:"urgent" as const})),
    ...blocked.slice(0,3).map(project=>({id:`project-${project.id}`,title:project.title,kind:"Geblokkeerd project",detail:project.due_date?`Deadline ${dateLabel(project.due_date)}`:"Actie of beslissing nodig",href:`/app/projecten/${project.id}`,severity:"urgent" as const})),
    ...waiting.slice(0,3).map(task=>({id:`waiting-${task.id}`,title:task.title,kind:task.status==="review"?"Wacht op review":"Wacht op input",detail:task.projects?.title??"Zonder project",href:`/app/taken/${task.id}`,severity:"warning" as const})),
  ].slice(0,6);

  const schedule:ScheduleView[]=[
    ...(events??[]).map(event=>({id:`event-${event.id}`,title:event.title,kind:"Event",at:event.start_at || event.start_date,href:`/app/events/${event.id}`})),
    ...(meetings??[]).map(meeting=>({id:`meeting-${meeting.id}`,title:meeting.title,kind:"Vergadering",at:meeting.meeting_at,href:`/app/vergaderingen/${meeting.id}`})),
  ].sort((a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime()).slice(0,6)
    .map(({at,...item})=>({...item,when:dateLabel(at,true)}));

  const widgets:DashboardWidget[]=[
    {label:"Mijn open taken",value:personalTasks.length,description:`${overdue.length} achterstallig`,href:"/app/taken?van_mij=1",tone:overdue.length?"red":"orange"},
    {label:"Mijn projecten",value:personalProjects.length,description:`${blocked.length} geblokkeerd`,href:"/app/projecten?van_mij=1",tone:blocked.length?"red":"green"},
    ...(manager?[{label:"Open actiepunten",value:meetingActions?.length??0,description:"Uit vergaderingen",href:"/app/vergaderingen",tone:"violet" as const},{label:"VZW-deadlines",value:openCompliance??0,description:"Binnen 14 dagen",href:"/app/administratie",tone:(openCompliance??0)>0?"red" as const:"green" as const}]:[]),
    ...(finance?[{label:"Financiële opvolging",value:pendingExpenses??0,description:"Te beoordelen of terugbetalen",href:"/app/financien",tone:(pendingExpenses??0)>0?"orange" as const:"green" as const}]:[]),
  ];

  return{
    loadState: "ready",
    name:profile?.display_name||user.email?.split("@")[0]||"Gebruiker",role:roleLabels[membership.role]||"Teamlid",roleKey:membership.role,
    taskCount:personalTasks.length,inboxCount:inboxRows?.length??0,projectCount:personalProjects.length,notificationCount:notificationCount??0,attentionCount:attention.length,
    tasks:personalTasks.slice(0,5).map(task=>({id:task.id,title:task.title,project:task.projects?.title??"Zonder project",due:task.due_at?dateLabel(task.due_at):"Geen deadline",priority:task.priority,status:statusLabels[task.status]??task.status})),
    inbox:(inboxRows??[]).map(item=>({id:item.id,title:item.title,source:item.source,created:new Intl.RelativeTimeFormat("nl").format(-Math.max(1,Math.round((Date.now()-new Date(item.created_at).getTime())/86400000)),"day")})),
    projects:personalProjects.slice(0,4).map((project,index)=>({id:project.id,name:project.title,progress:project.status==="active"?50:project.status==="blocked"?35:20,status:projectLabels[project.status]??project.status,due:project.due_date?dateLabel(project.due_date):"Nog te plannen",color:["#ef7f3b","#7357d6","#2f8f77","#c64545"][index%4]})),
    attention,schedule,actionItems:(meetingActions??[]).slice(0,5).map(item=>({id:item.id,title:item.title,meeting:(item.meetings as unknown as {title:string}|null)?.title??"Vergadering",href:item.task_id?`/app/taken/${item.task_id}`:`/app/vergaderingen/${item.meeting_id}`})),widgets,
  };
}
