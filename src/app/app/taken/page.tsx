import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ModulePage } from "@/components/module-page";
import { TaskCreateModal } from "@/components/task-create-modal";
import { SavedViews } from "@/components/saved-views";
import { demoDashboard } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { updateTaskStatus } from "../actions";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at?: string | null;
  projects: { title: string } | null;
};

const taskStatuses = [
  { value: "todo", label: "Te doen" },
  { value: "doing", label: "Bezig" },
  { value: "waiting", label: "Wachten" },
  { value: "review", label: "Review" },
  { value: "done", label: "Afgerond" },
  { value: "cancelled", label: "Geannuleerd" },
];

const labels = Object.fromEntries(taskStatuses.map(({ value, label }) => [value, label]));

function TaskList({ tasks, completed = false }: { tasks: TaskRow[]; completed?: boolean }) {
  return (
    <div className={`data-list ${completed ? "completed-list" : ""}`}>
      {tasks.map((task) => (
        <article key={task.id}>
          <form action={updateTaskStatus}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="status" value={completed ? "todo" : "done"} />
            <button
              className={`check ${completed ? "checked" : ""}`}
              aria-label={completed ? "Heropenen" : "Afronden"}
            >
              {completed ? "✓" : ""}
            </button>
          </form>
          <div>
            <Link className="task-link" href={`/app/taken/${task.id}`}>
              <strong>{task.title}</strong>
            </Link>
            <p>
              {task.projects?.title ?? "Zonder project"} ·{" "}
              {formatDateTime(task.due_at, "geen deadline")}
            </p>
          </div>
          <span className="badge">{labels[task.status] ?? task.status}</span>
          <form action={updateTaskStatus}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="status" value={completed ? "todo" : "doing"} />
            <button type="submit">{completed ? "Heropen" : "Start"}</button>
          </form>
        </article>
      ))}
    </div>
  );
}

const successMessages = new Map<string, string>([
  ["aangemaakt", "De taak werd aangemaakt."],
  ["taak-aangemaakt", "De taak werd aangemaakt."],
  ["taak", "De taak werd bijgewerkt."],
  ["verwijderd", "De taak werd verwijderd uit de werkvoorraad."],
]);

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const currentQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) currentQuery.set(key, value);
  const search = params.zoek?.trim() ?? "";
  const status = params.status ?? "";
  const mine = params.van_mij === "1";
  const overdue = params.periode === "achterstallig";
  const openOnly = params.weergave === "open";
  let allTasks: TaskRow[] = demoDashboard.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_at: task.due,
    projects: { title: task.project },
  }));
  let projects: { id: string; title: string }[] = [];
  let people: { id: string; label: string }[] = [];

  if (isSupabaseConfigured()) {
    const { supabase, user, membership } = await requireActiveMembership();
    let assignedTaskIds: string[] | null = null;

    if (mine) {
      const { data: assignments } = await supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", user.id);
      assignedTaskIds = (assignments ?? []).map((assignment) => assignment.task_id);
    }

    let taskQuery = supabase
      .from("tasks")
      .select("id,title,status,priority,due_at,completed_at,projects(title)")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false });

    if (search) taskQuery = taskQuery.ilike("title", `%${search}%`);
    if (status) taskQuery = taskQuery.eq("status", status);
    if (overdue) taskQuery = taskQuery.lte("due_at", new Date().toISOString());
    if (openOnly) taskQuery = taskQuery.not("status", "in", "(done,cancelled)");
    if (assignedTaskIds) {
      taskQuery =
        assignedTaskIds.length > 0
          ? taskQuery.in("id", assignedTaskIds)
          : taskQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
    }

    const [{ data: taskData }, { data: projectData }, { data: memberData }] = await Promise.all([
      taskQuery,
      supabase
        .from("projects")
        .select("id,title")
        .eq("organization_id", membership.organization_id)
        .is("deleted_at", null)
        .in("status", ["planned", "active"])
        .order("title"),
      supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", membership.organization_id).eq("status", "active"),
    ]);
    allTasks = (taskData ?? []) as unknown as TaskRow[];
    projects = projectData ?? [];
    people = (memberData ?? []).map((member) => ({ id: member.user_id, label: (member.profiles as { display_name?: string } | null)?.display_name ?? "Naamloos account" }));
  } else {
    if (search) {
      allTasks = allTasks.filter((task) =>
        task.title.toLocaleLowerCase("nl-BE").includes(search.toLocaleLowerCase("nl-BE")),
      );
    }
    if (status) allTasks = allTasks.filter((task) => task.status === status);
    if (overdue) allTasks = allTasks.filter((task) => task.due_at && new Date(task.due_at) <= new Date());
    if (openOnly) allTasks = allTasks.filter((task) => !["done", "cancelled"].includes(task.status));
    if (mine) allTasks = [];
  }

  const tasks = allTasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const completed = allTasks
    .filter((task) => ["done", "cancelled"].includes(task.status))
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime(),
    )
    .slice(0, 20);

  return (
    <AppShell active="Mijn werk">
      <ModulePage
        eyebrow="PERSOONLIJK OVERZICHT"
        title="Mijn werk"
        description="Alles wat nu jouw aandacht vraagt, over alle BESC-projecten heen."
        action="Taak"
        search={search}
        status={status}
        mine={mine}
        statusOptions={taskStatuses}
        showMine
        resultCount={tasks.length + completed.length}
      >
        {params.fout && <div className="error-note">{params.fout === "dossier-niet-beschikbaar" ? "Het dossier is niet meer beschikbaar. De link werd niet gewijzigd." : params.fout === "dossier-controleren" ? "Het dossier kon niet worden gecontroleerd. De link werd niet gewijzigd. Probeer opnieuw." : "De taak kon niet worden opgeslagen."}</div>}
        {params.succes && <div className="success">{successMessages.get(params.succes) ?? "Wijziging opgeslagen."}</div>}
        {overdue && <div className="permission-note">Je ziet nu alleen taken waarvan de deadline verstreken is. <Link href="/app/taken?van_mij=1">Toon al mijn taken</Link></div>}
        {openOnly && <div className="permission-note">Je ziet nu alleen open taken. <Link href="/app/taken">Toon ook de historiek</Link></div>}
        {params.nieuw && (
          <TaskCreateModal returnTo="/app/taken" projects={projects} people={people}/>
        )}
        <SavedViews
          module="tasks"
          path="/app/taken"
          currentQuery={currentQuery.toString()}
        />
        {tasks.length > 0 ? (
          <TaskList tasks={tasks} />
        ) : (
          <div className="empty">
            {search || status || mine
              ? "Geen open taken gevonden met deze filters."
              : "Er zijn momenteel geen open taken."}
          </div>
        )}
        {!openOnly && completed.length > 0 && (
          <section className="completed-section">
            <div>
              <span className="eyebrow">HISTORIEK</span>
              <h2>Recent afgerond</h2>
              <p>Afgeronde taken blijven zichtbaar en kunnen opnieuw worden geopend.</p>
            </div>
            <TaskList tasks={completed} completed />
          </section>
        )}
      </ModulePage>
    </AppShell>
  );
}
