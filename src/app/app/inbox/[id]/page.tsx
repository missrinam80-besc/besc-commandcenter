import {MarkdownContent} from "@/components/markdown-field";
import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { Archive, ArrowRight, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth-context";
import { archiveInboxItem, convertInboxItem, deleteInboxItem } from "./actions";

const statusOptions = [
  ["new", "Nieuw"],
  ["reviewing", "In beoordeling"],
  ["waiting", "Wachten"],
  ["processed", "Verwerkt"],
  ["rejected", "Afgewezen"],
  ["archived", "Gearchiveerd"],
] as const;
const priorityLabels: Record<string, string> = {
  low: "Laag", normal: "Normaal", high: "Hoog", urgent: "Urgent",
};
const statusLabels = Object.fromEntries(statusOptions);
const conversionGroups = [
  {
    label: "Werk & planning",
    options: [
      ["task", "Taak", "Een uitvoerbaar actiepunt"],
      ["project", "Project", "Een groter werktraject"],
      ["meeting", "Vergadering", "Een overleg of bespreking"],
    ],
  },
  {
    label: "Communicatie & activiteiten",
    options: [
      ["content", "Contentitem", "Een idee voor contentproductie"],
      ["campaign", "Campagne", "Een marketing- of communitycampagne"],
      ["social", "Social post", "Een publicatie voor een kanaal"],
      ["event", "Event", "Een activiteit of evenement"],
    ],
  },
  {
    label: "Mensen & relaties",
    options: [
      ["volunteer", "Vrijwilliger / persoon", "Een kandidaat-communityprofiel"],
      ["sponsor", "Sponsor / partner", "Een nieuw CRM-prospect"],
    ],
  },
  {
    label: "Kennis & shop",
    options: [
      ["knowledge", "Kennisbankartikel", "Een nieuw conceptartikel"],
      ["product", "Shopproduct", "Een productidee"],
      ["launch", "Merchlancering", "Een collectie- of lanceringsidee"],
    ],
  },
] as const;

export default async function InboxItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const unifiedEditor = await dossierEditorGate({kind:"inbox",id,query:query});
  if (unifiedEditor) return unifiedEditor;

  const { supabase, membership } = await requirePermission("manageInbox", "/app/inbox?fout=geen-toegang");
  const { data: item } = await supabase
    .from("inbox_items")
    .select("id,title,description,source,status,priority,created_at,updated_at")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) notFound();

  return (
    <AppShell active="Inbox">
      <header className="project-detail-head">
        <div>
          <Link href="/app/inbox">← Terug naar inbox</Link>
          <span className="eyebrow">INBOXITEM</span>
          <h1>{item.title}</h1>
          <p>Ingediend via {item.source} op {new Date(item.created_at).toLocaleDateString("nl-BE")}</p>
        </div>
        <div className="project-actions">
          {item.status === "processed" && (
            <form action={archiveInboxItem}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit"><Archive size={16} />Archiveren</button>
            </form>
          )}
          <Link className="primary" href="?bewerken=1">Bewerken</Link>
        </div>
      </header>
      <div className="project-detail-body">
        {query.fout && <div className="error-note">De actie is mislukt ({query.fout}).</div>}
        {query.succes && <div className="success">Het inboxitem werd bijgewerkt.</div>}

        {(
          <>
            <section className="project-summary">
              <article><span>Status</span><strong>{statusLabels[item.status] ?? item.status}</strong></article>
              <article><span>Prioriteit</span><strong>{priorityLabels[item.priority] ?? item.priority}</strong></article>
              <article><span>Bron</span><strong>{item.source}</strong></article>
              <article><span>Bijgewerkt</span><strong>{new Date(item.updated_at).toLocaleDateString("nl-BE")}</strong></article>
            </section>
            <section className="form-card record-notes">
              <div className="form-heading"><h2>Beschrijving</h2></div>
              <MarkdownContent>{item.description || "Er werd geen beschrijving toegevoegd."}</MarkdownContent>
            </section>

            {item.status !== "processed" && (
              <section className="form-card inbox-conversion">
                <div className="form-heading"><div><h2>Omzetten naar BESC-werk</h2><p>Titel, beschrijving en prioriteit worden overgenomen.</p></div></div>
                <div className="conversion-groups">
                  {conversionGroups.map((group) => (
                    <section key={group.label}>
                      <h3>{group.label}</h3>
                      <div className="conversion-options">
                        {group.options.map(([target, label, help]) => (
                          <form action={convertInboxItem} key={target}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="target" value={target} />
                            <div><strong>{label}</strong><span>{help}</span></div>
                            <button type="submit" aria-label={`Omzetten naar ${label}`}><ArrowRight size={16} /></button>
                          </form>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            )}

            <section className="form-card danger-zone">
              <div><h2>Inboxitem verwijderen</h2><p>Het item verdwijnt uit de inbox, maar blijft technisch bewaard voor auditdoeleinden.</p></div>
              <form action={deleteInboxItem}>
                <input type="hidden" name="id" value={item.id} />
                <label>Typ VERWIJDER om te bevestigen<input name="confirmation" required pattern="VERWIJDER" /></label>
                <button><Trash2 size={15} />Verwijderen</button>
              </form>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
