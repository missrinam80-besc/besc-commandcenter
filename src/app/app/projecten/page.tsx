import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ModulePage } from "@/components/module-page";
import { EntityForm } from "@/components/entity-form";
import { SavedViews } from "@/components/saved-views";
import { demoDashboard } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { requireActiveMembership } from "@/lib/auth-context";
import { createProject } from "../actions";

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
};

const projectStatuses = [
  { value: "idea", label: "Idee" },
  { value: "planned", label: "Gepland" },
  { value: "active", label: "Actief" },
  { value: "blocked", label: "Geblokkeerd" },
  { value: "done", label: "Afgerond" },
  { value: "archived", label: "Gearchiveerd" },
];

const projectStatusLabels = Object.fromEntries(
  projectStatuses.map(({ value, label }) => [value, label]),
);

export default async function ProjectsPage({
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
  let projects: ProjectRow[] = demoDashboard.projects.map((project) => ({
    id: project.id,
    title: project.name,
    status: project.status,
    due_date: project.due,
  }));

  if (isSupabaseConfigured()) {
    const { supabase, user, membership } = await requireActiveMembership();
    let query = supabase
      .from("projects")
      .select("id,title,status,due_date")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (search) query = query.ilike("title", `%${search}%`);
    if (status) query = query.eq("status", status);
    if (mine) query = query.eq("owner_id", user.id);

    const { data } = await query;
    projects = data ?? [];
  } else {
    if (search) {
      projects = projects.filter((project) =>
        project.title.toLocaleLowerCase("nl-BE").includes(search.toLocaleLowerCase("nl-BE")),
      );
    }
    if (status) projects = projects.filter((project) => project.status === status);
    if (mine) projects = [];
  }

  return (
    <AppShell active="Projecten">
      <ModulePage
        eyebrow="BESC INITIATIEVEN"
        title="Projecten"
        description="Volg doelen, eigenaarschap, planning en uitvoering vanuit één helder dossier."
        action="Project"
        search={search}
        status={status}
        mine={mine}
        statusOptions={projectStatuses}
        showMine
        resultCount={projects.length}
      >
        {params.fout && <div className="error-note">Het project kon niet worden opgeslagen.</div>}
        {params.succes && <div className="success">Het project werd aangemaakt.</div>}
        {params.nieuw && (
          <EntityForm title="Nieuw project" action={createProject}>
            <div className="form-row">
              <label>
                Startdatum
                <input type="date" name="start_date" />
              </label>
              <label>
                Deadline
                <input type="date" name="due_date" />
              </label>
            </div>
            <label>
              Google Drive-map
              <input type="url" name="drive_url" placeholder="https://drive.google.com/..." />
            </label>
            <label>
              Prioriteit
              <select name="priority" defaultValue="normal">
                <option value="low">Laag</option>
                <option value="normal">Normaal</option>
                <option value="high">Hoog</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </EntityForm>
        )}
        <SavedViews
          module="projects"
          path="/app/projecten"
          currentQuery={currentQuery.toString()}
        />
        <div className="data-list">
          {projects.map((project, index) => (
            <article key={project.id}>
              <span
                className="project-dot large"
                style={{ background: ["#ef7f3b", "#7357d6", "#2f8f77"][index % 3] }}
              />
              <div>
                <strong>{project.title}</strong>
                <p>Mijlpaal {project.due_date ?? "nog te plannen"}</p>
              </div>
              <span className="badge">
                {projectStatusLabels[project.status] ?? project.status}
              </span>
              <Link className="row-action" href={`/app/projecten/${project.id}`}>
                Openen
              </Link>
            </article>
          ))}
          {!projects.length && (
            <div className="empty">
              {search || status || mine
                ? "Geen projecten gevonden met deze filters."
                : "Nog geen projecten."}
            </div>
          )}
        </div>
      </ModulePage>
    </AppShell>
  );
}
