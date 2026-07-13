import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/activity-timeline";
import { AppShell } from "@/components/app-shell";
import { Comments } from "@/components/comments";
import { requireActiveMembership } from "@/lib/auth-context";
import { addChecklistItem, setTaskAssignee, toggleChecklistItem, updateTaskDetails } from "./actions";

type TaskDetail={id:string;title:string;description:string|null;status:string;priority:string;due_at:string|null;project_id:string|null;projects:{id:string;title:string}|null;task_assignees:{user_id:string;profiles:{display_name:string|null}|null}[]};
type Checklist={id:string;title:string;is_done:boolean};
type Member={user_id:string;profiles:{display_name:string|null}|null};
type ProjectOption={id:string;title:string;status:string};

export default async function TaskDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const{id}=await params;
  const query=await searchParams;
  const{supabase,membership}=await requireActiveMembership();
  const[{data:t},{data:checks},{data:members},{data:projects},{data:commentRows},{data:events}]=await Promise.all([
    supabase.from("tasks").select("id,title,description,status,priority,due_at,project_id,projects(id,title),task_assignees(user_id,profiles(display_name))").eq("id",id).is("deleted_at",null).maybeSingle(),
    supabase.from("task_checklist_items").select("id,title,is_done").eq("task_id",id).order("position").order("created_at"),
    supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id",membership.organization_id).eq("status","active"),
    supabase.from("projects").select("id,title,status").eq("organization_id",membership.organization_id).is("deleted_at",null).order("title"),
    supabase.from("comments").select("id,body,created_at,profiles!comments_author_id_fkey(display_name)").eq("entity_type","task").eq("entity_id",id).order("created_at"),
    supabase.from("activity_events").select("id,action,created_at,profiles!activity_events_actor_id_fkey(display_name)").eq("entity_type","task").eq("entity_id",id).order("created_at",{ascending:false}).limit(20),
  ]);
  if(!t)notFound();
  const task=t as unknown as TaskDetail;
  const checklist=(checks??[]) as Checklist[];
  const people=(members??[]) as unknown as Member[];
  const projectOptions=(projects??[]) as ProjectOption[];
  const currentAssignee=task.task_assignees?.[0]?.user_id||"";
  const done=checklist.filter(c=>c.is_done).length;

  return <AppShell active="Mijn werk">
    <header className="project-detail-head"><div><Link href={task.project_id?`/app/projecten/${task.project_id}`:"/app/taken"}>← {task.project_id?"Terug naar project":"Mijn werk"}</Link><span className="eyebrow">TAAKDOSSIER</span><h1>{task.title}</h1><p>{task.projects?.title||"Zonder project"}</p></div><span className="badge">{task.status}</span></header>
    <div className="task-detail-body">
      {query.fout&&<div className="error-note">Wijziging mislukt: {query.fout}.</div>}
      {query.succes&&<div className="success">De taak werd bijgewerkt.</div>}
      <div className="task-detail-grid"><section className="form-card"><div className="form-heading"><h2>Taakgegevens</h2></div>
        <form action={updateTaskDetails}><input type="hidden" name="id" value={task.id}/><label>Titel<input name="title" defaultValue={task.title} required/></label><label>Beschrijving<textarea name="description" rows={6} defaultValue={task.description||""}/></label><label>Project<select name="project_id" defaultValue={task.project_id||""}><option value="">Geen project</option>{projectOptions.map(p=><option key={p.id} value={p.id}>{p.title}{["done","archived"].includes(p.status)?" (afgerond)":""}</option>)}</select></label><div className="form-row"><label>Status<select name="status" defaultValue={task.status}><option value="todo">Te doen</option><option value="doing">Bezig</option><option value="waiting">Wachten</option><option value="review">Review</option><option value="done">Afgerond</option><option value="cancelled">Geannuleerd</option></select></label><label>Prioriteit<select name="priority" defaultValue={task.priority}><option value="low">Laag</option><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option></select></label></div><label>Deadline<input type="datetime-local" name="due_at" defaultValue={task.due_at?.slice(0,16)||""}/></label><div className="form-actions"><button className="primary">Wijzigingen opslaan</button></div></form>
      </section><aside><section className="form-card"><div className="form-heading"><h2>Verantwoordelijke</h2></div><form action={setTaskAssignee}><input type="hidden" name="task_id" value={task.id}/><label>Toewijzen aan<select name="user_id" defaultValue={currentAssignee}><option value="">Niet toegewezen</option>{people.map(p=><option key={p.user_id} value={p.user_id}>{p.profiles?.display_name||"Naamloos account"}</option>)}</select></label><button className="secondary-button">Toewijzing opslaan</button></form></section>
        <section className="form-card checklist-card"><div className="form-heading"><div><h2>Checklist</h2><span>{done}/{checklist.length} klaar</span></div></div><div className="checklist">{checklist.map(c=><form action={toggleChecklistItem} key={c.id}><input type="hidden" name="task_id" value={task.id}/><input type="hidden" name="id" value={c.id}/><input type="hidden" name="is_done" value={String(!c.is_done)}/><button className={`check ${c.is_done?"checked":""}`}>{c.is_done?"✓":""}</button><span className={c.is_done?"done":""}>{c.title}</span></form>)}</div><form className="add-check" action={addChecklistItem}><input type="hidden" name="task_id" value={task.id}/><input name="title" required placeholder="Nieuw checklistitem..."/><button>Toevoegen</button></form></section>
      </aside></div>
      <Comments entityType="task" entityId={task.id} returnTo={`/app/taken/${task.id}`} comments={(commentRows??[]) as never[]}/><ActivityTimeline events={(events??[]) as never[]}/>
    </div>
  </AppShell>;
}
