import Link from "next/link";
import { Bookmark, Trash2 } from "lucide-react";
import {
  deleteSavedView,
  saveCurrentView,
} from "@/app/app/saved-views/actions";
import { requireActiveMembership } from "@/lib/auth-context";

type SavedViewModule =
  | "inbox"
  | "tasks"
  | "projects"
  | "content"
  | "events"
  | "sponsors"
  | "campagnes"
  | "community"
  | "social"
  | "historiek";

type SavedView = {
  id: string;
  name: string;
  query_params: Record<string, string>;
};

export async function SavedViews({
  module,
  path,
  currentQuery,
}: {
  module: SavedViewModule;
  path: string;
  currentQuery: string;
}) {
  const { supabase, membership, user } = await requireActiveMembership();
  const { data } = await supabase
    .from("saved_views")
    .select("id,name,query_params")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", user.id)
    .eq("module", module)
    .order("created_at", { ascending: true });
  const views = (data ?? []) as SavedView[];

  return (
    <section className="saved-views" aria-label="Opgeslagen weergaven">
      <div className="saved-views-list">
        <span>
          <Bookmark size={14} />
          Mijn weergaven
        </span>
        {views.map((view) => {
          const query = new URLSearchParams(view.query_params).toString();
          return (
            <div className="saved-view" key={view.id}>
              <Link href={`${path}${query ? `?${query}` : ""}`}>{view.name}</Link>
              <form action={deleteSavedView}>
                <input type="hidden" name="id" value={view.id} />
                <input type="hidden" name="module" value={module} />
                <button aria-label={`Verwijder weergave ${view.name}`}>
                  <Trash2 size={12} />
                </button>
              </form>
            </div>
          );
        })}
        {!views.length && <small>Nog geen persoonlijke weergaven.</small>}
      </div>
      <details className="save-view">
        <summary>Huidige filters opslaan</summary>
        <form action={saveCurrentView}>
          <input type="hidden" name="module" value={module} />
          <input type="hidden" name="query" value={currentQuery} />
          <label>
            <span className="sr-only">Naam van de weergave</span>
            <input name="name" required minLength={2} maxLength={80} placeholder="Naam..." />
          </label>
          <button>Opslaan</button>
        </form>
      </details>
    </section>
  );
}
