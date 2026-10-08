import { dossierEditorGate } from "@/components/dossier-editor-gate";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { SavedViews } from "@/components/saved-views";
import { demoDashboard } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { requireActiveMembership } from "@/lib/auth-context";

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
  { value: "rejected", label: "Afgewezen" },
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
  const unifiedEditor = await dossierEditorGate({kind:"inbox",query:params});
  if (unifiedEditor) return unifiedEditor;

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
      .not("status", "in", "(processed,archived)")
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
    items = items.filter((item) => !["processed", "archived"].includes(item.status));
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
                <Link className="task-link" href={`/app/inbox/${item.id}`}>
                  <strong>{item.title}</strong>
                </Link>
                <p>Via {item.source}</p>
              </div>
              <span className="badge purple">
                {inboxStatusLabels[item.status] ?? item.status}
              </span>
              <Link className="row-action" href={`/app/inbox/${item.id}`}>Openen</Link>
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
