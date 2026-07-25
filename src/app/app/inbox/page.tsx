import { AppShell } from "@/components/app-shell";
import { ModulePage } from "@/components/module-page";
import { EntityForm } from "@/components/entity-form";
import { SavedViews } from "@/components/saved-views";
import { demoDashboard } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { requireActiveMembership } from "@/lib/auth-context";
import { createInboxItem, convertInboxToTask } from "../actions";

type InboxRow = {
  id: string;
  title: string;
  source: string;
  created_at: string;
  status: string;
};

const inboxStatuses = [
  { value: "new", label: "Nieuw" },
  { value: "reviewing", label: "In beoordeling" },
  { value: "waiting", label: "Wachten" },
  { value: "processed", label: "Verwerkt" },
  { value: "rejected", label: "Afgewezen" },
  { value: "archived", label: "Gearchiveerd" },
];

const inboxStatusLabels = Object.fromEntries(
  inboxStatuses.map(({ value, label }) => [value, label]),
);

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const currentQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) currentQuery.set(key, value);
  const search = params.zoek?.trim() ?? "";
  const status = params.status ?? "";
  let items: InboxRow[] = demoDashboard.inbox.map((item) => ({
    id: item.id,
    title: item.title,
    source: item.source,
    created_at: item.created,
    status: "new",
  }));

  if (isSupabaseConfigured()) {
    const { supabase, membership } = await requireActiveMembership();
    let query = supabase
      .from("inbox_items")
      .select("id,title,source,created_at,status")
      .eq("organization_id", membership.organization_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (search) query = query.ilike("title", `%${search}%`);
    if (status) query = query.eq("status", status);

    const { data } = await query;
    items = (data ?? []) as InboxRow[];
  } else {
    if (search) {
      items = items.filter((item) =>
        item.title.toLocaleLowerCase("nl-BE").includes(search.toLocaleLowerCase("nl-BE")),
      );
    }
    if (status) items = items.filter((item) => item.status === status);
  }

  return (
    <AppShell active="Inbox">
      <ModulePage
        eyebrow="CENTRALE INTAKE"
        title="Inbox"
        description="Beoordeel ideeën, aanvragen en opportuniteiten voordat ze BESC-werk worden."
        action="Inboxitem"
        search={search}
        status={status}
        statusOptions={inboxStatuses}
        resultCount={items.length}
      >
        {params.fout && (
          <div className="error-note">
            Actie mislukt: {params.fout}. Controleer de configuratie en velden.
          </div>
        )}
        {params.succes && <div className="success">Het inboxitem werd succesvol verwerkt.</div>}
        {params.nieuw && (
          <EntityForm title="Nieuw inboxitem" action={createInboxItem}>
            <div className="form-row">
              <label>
                Bron
                <select name="source" defaultValue="manual">
                  <option value="manual">Handmatig</option>
                  <option value="discord">Discord</option>
                  <option value="email">E-mail</option>
                  <option value="form">Formulier</option>
                </select>
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
            </div>
          </EntityForm>
        )}
        <SavedViews
          module="inbox"
          path="/app/inbox"
          currentQuery={currentQuery.toString()}
        />
        <div className="data-list">
          {items.map((item) => (
            <article key={item.id}>
              <span className="source discord">{item.source[0].toUpperCase()}</span>
              <div>
                <strong>{item.title}</strong>
                <p>Via {item.source}</p>
              </div>
              <span className="badge purple">
                {inboxStatusLabels[item.status] ?? item.status}
              </span>
              <form action={convertInboxToTask}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="title" value={item.title} />
                <button type="submit">Maak taak</button>
              </form>
            </article>
          ))}
          {!items.length && (
            <div className="empty">
              {search || status
                ? "Geen inboxitems gevonden met deze filters."
                : "De inbox is leeg."}
            </div>
          )}
        </div>
      </ModulePage>
    </AppShell>
  );
}
