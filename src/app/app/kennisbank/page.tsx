import Link from "next/link";
import type { CSSProperties } from "react";
import { BookOpen, FolderOpen, Search, Star } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FormModal } from "@/components/form-modal";
import { KnowledgeForm } from "@/components/knowledge-form";
import { requireActiveMembership } from "@/lib/auth-context";
import { saveKnowledgeCategory } from "./actions";

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

function cleanSearch(value?: string) {
  return (value ?? "").replaceAll(",", " ").trim();
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  const { supabase, membership } = await requireActiveMembership();
  const organizationId = membership.organization_id;
  const manager = ["admin", "board"].includes(membership.role);
  const search = cleanSearch(q.zoeken);

  let request = supabase
    .from("knowledge_articles")
    .select("id,title,summary,article_type,status,tags,updated_at,review_due_date,knowledge_categories(name,color),profiles!knowledge_articles_owner_id_fkey(display_name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (search) request = request.or(`title.ilike.%${search}%,summary.ilike.%${search}%,body.ilike.%${search}%`);
  if (q.categorie) request = request.eq("category_id", q.categorie);
  if (q.type) request = request.eq("article_type", q.type);
  if (q.status) request = request.eq("status", q.status);

  const [{ data: articles }, { data: categories }, { data: members }] = await Promise.all([
    request,
    supabase
      .from("knowledge_categories")
      .select("id,name,description,color")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("organization_members")
      .select("user_id,profiles(display_name)")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  const people = (members ?? []).map((member) => ({
    id: member.user_id,
    display_name: (member.profiles as unknown as { display_name: string | null } | null)?.display_name,
  }));
  const startArticle = (articles ?? []).find((article) => article.title === "Start hier: werken met BESC Command Center");

  return (
    <AppShell active="Kennisbank">
      <header className="topbar module-top">
        <div>
          <p>KENNIS & PROCEDURES</p>
          <h1>Kennisbank</h1>
        </div>
        {manager && (
          <div className="project-actions">
            <Link href="?nieuw=categorie">Nieuwe categorie</Link>
            <Link className="primary" href="?nieuw=artikel">Nieuw artikel</Link>
          </div>
        )}
      </header>
      <div className="module-body">
        <p className="lead">Bewaar procedures, handleidingen, beleid, onboarding en interne referenties op een doorzoekbare plek.</p>
        {q.fout && <div className="error-note">De actie is mislukt ({q.fout}).</div>}
        {q.succes && <div className="success">De kennisbank is bijgewerkt.</div>}

        {q.nieuw === "categorie" && manager && (
          <FormModal title="Nieuwe categorie" closeHref="/app/kennisbank">
            <form action={saveKnowledgeCategory}>
              <label>
                Naam
                <input name="name"/>
              </label>
              <label>
                Beschrijving
                <textarea name="description" rows={3}/>
              </label>
              <label>
                Kleur
                <input type="color" name="color" defaultValue="#6b7280"/>
              </label>
              <div className="form-actions">
                <button className="primary">Opslaan</button>
              </div>
            </form>
          </FormModal>
        )}

        {q.nieuw === "artikel" && manager && (
          <FormModal title="Nieuw kennisartikel" closeHref="/app/kennisbank">
            <KnowledgeForm categories={categories ?? []} people={people}/>
          </FormModal>
        )}

        {startArticle && (
          <section className="knowledge-start">
            <div>
              <span><Star size={14}/> Startpunt</span>
              <h2>{startArticle.title}</h2>
              <p>{startArticle.summary || "De eerste handleiding voor werken met het Command Center."}</p>
            </div>
            <Link className="primary" href={`/app/kennisbank/${startArticle.id}`}>Open handleiding</Link>
          </section>
        )}

        <section className="knowledge-category-strip">
          <article>
            <BookOpen size={18}/>
            <div>
              <span>Artikelen</span>
              <strong>{articles?.length ?? 0}</strong>
            </div>
          </article>
          {(categories ?? []).map((category) => (
            <Link
              href={`?categorie=${category.id}`}
              key={category.id}
              style={{ "--category-color": category.color } as CSSProperties}
            >
              <FolderOpen size={16}/>
              <div>
                <strong>{category.name}</strong>
                <span>{category.description || "Geen beschrijving"}</span>
              </div>
            </Link>
          ))}
        </section>

        <form className="knowledge-filters">
          <label className="search">
            <Search size={15}/>
            <input name="zoeken" defaultValue={q.zoeken ?? ""} placeholder="Zoek in titel, samenvatting of inhoud..."/>
          </label>
          <select name="categorie" defaultValue={q.categorie ?? ""}>
            <option value="">Alle categorieen</option>
            {(categories ?? []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <select name="type" defaultValue={q.type ?? ""}>
            <option value="">Alle types</option>
            {Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          {manager && (
            <select name="status" defaultValue={q.status ?? ""}>
              <option value="">Alle statussen</option>
              {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          )}
          <button>Filter</button>
          <Link href="/app/kennisbank">Wissen</Link>
        </form>

        <section className="knowledge-grid">
          {(articles ?? []).map((article) => {
            const category = article.knowledge_categories as unknown as { name: string; color: string } | null;
            const owner = article.profiles as unknown as { display_name: string | null } | null;
            return (
              <Link href={`/app/kennisbank/${article.id}`} key={article.id}>
                <div className="knowledge-card-top">
                  <span style={{ background: category?.color || "#6b7280" }}>{category?.name || "Ongecategoriseerd"}</span>
                  <b>{statusLabels[article.status] || article.status}</b>
                </div>
                <h2>{article.title}</h2>
                <p>{article.summary || "Nog geen samenvatting."}</p>
                <div className="knowledge-card-meta">
                  <span>{typeLabels[article.article_type] || article.article_type}</span>
                  <span>{owner?.display_name || "Geen eigenaar"}</span>
                  <span>{new Date(article.updated_at).toLocaleDateString("nl-BE")}</span>
                </div>
              </Link>
            );
          })}
          {!articles?.length && <div className="empty">Geen kennisartikelen gevonden.</div>}
        </section>
      </div>
    </AppShell>
  );
}
