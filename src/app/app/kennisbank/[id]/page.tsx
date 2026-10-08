import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { ExternalLink, History } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MarkdownContent } from "@/components/markdown-field";
import { requireActiveMembership } from "@/lib/auth-context";

const typeLabels: Record<string, string> = {
  procedure: "Procedure",
  guide: "Handleiding",
  policy: "Beleid",
  faq: "FAQ",
  onboarding: "Onboarding",
  template: "Sjabloon",
  reference: "Referentie",
  other: "Overige",
};

const statusLabels: Record<string, string> = {
  draft: "Concept",
  review: "In review",
  published: "Gepubliceerd",
  outdated: "Te herzien",
  archived: "Gearchiveerd",
};

export default async function KnowledgeDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const unifiedEditor = await dossierEditorGate({kind:"knowledge",id,query:q});
  if (unifiedEditor) return unifiedEditor;

  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  const manager = ["admin", "board"].includes(membership.role);

  const [{ data: article }, { data: revisions }] = await Promise.all([
    supabase
        .from("knowledge_articles")
        .select("*,knowledge_categories(name,color),profiles!knowledge_articles_owner_id_fkey(display_name)")
        .eq("organization_id", organizationId)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
    supabase
        .from("knowledge_revisions")
        .select("id,change_note,created_at,profiles!knowledge_revisions_changed_by_fkey(display_name)")
        .eq("article_id", id)
        .order("created_at", { ascending: false })
        .limit(20)
  ]);

  if (!article) notFound();

  const category = article.knowledge_categories as unknown as { name: string; color: string } | null;
  const owner = article.profiles as unknown as { display_name: string | null } | null;

  return (
    <AppShell active="Kennisbank">
      <header className="project-detail-head">
        <div>
          <Link href="/app/kennisbank">Terug naar kennisbank</Link>
          <span className="eyebrow">{category?.name || "KENNISARTIKEL"}</span>
          <h1>{article.title}</h1>
          <p>{article.summary || "Geen samenvatting."}</p>
        </div>
        <div className="project-actions">
          {article.drive_url && (
            <a href={article.drive_url} target="_blank" rel="noreferrer">
              <ExternalLink size={16}/>Open Drive
            </a>
          )}
          {manager && <Link className="primary" href="?bewerken=1">Bewerken</Link>}
        </div>
      </header>
      <div className="project-detail-body">
        {q.succes && <div className="success">Artikel bijgewerkt en vorige versie bewaard.</div>}
        {q.fout && <div className="error-note">Opslaan is mislukt ({q.fout}).</div>}

        <section className="project-summary">
          <article>
            <span>Status</span>
            <strong>{statusLabels[article.status] || article.status}</strong>
          </article>
          <article>
            <span>Type</span>
            <strong>{typeLabels[article.article_type] || article.article_type}</strong>
          </article>
          <article>
            <span>Eigenaar</span>
            <strong>{owner?.display_name || "-"}</strong>
          </article>
          <article>
            <span>Herzien tegen</span>
            <strong>{article.review_due_date || "-"}</strong>
          </article>
        </section>

        <section className="form-card knowledge-article-body">
          {article.body ? <MarkdownContent>{article.body}</MarkdownContent> : <p>Nog geen inhoud toegevoegd.</p>}
          <div className="knowledge-tags">
            {(article.tags ?? []).map((tag: string) => <span key={tag}>{tag}</span>)}
          </div>
        </section>

        {manager && (
          <section className="activity-card">
            <div className="form-heading">
              <h2><History size={17}/>Versiehistoriek</h2>
              <span>{revisions?.length ?? 0} wijzigingen</span>
            </div>
            <div className="activity-list">
              {(revisions ?? []).map((revision) => (
                <article key={revision.id}>
                  <span className="activity-dot"/>
                  <div>
                    <strong>{(revision.profiles as unknown as { display_name: string | null } | null)?.display_name || "Onbekend"}</strong>{" "}
                    {revision.change_note || "Artikel bijgewerkt"}
                    <time>{new Date(revision.created_at).toLocaleString("nl-BE")}</time>
                  </div>
                </article>
              ))}
              {!revisions?.length && <p className="empty-inline">Nog geen eerdere versies.</p>}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
