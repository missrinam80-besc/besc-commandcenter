import { Plus, Search, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type FilterOption = { value: string; label: string };

type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  children: ReactNode;
  search?: string;
  status?: string;
  mine?: boolean;
  statusOptions?: FilterOption[];
  showMine?: boolean;
  resultCount?: number;
};

export function ModulePage({
  eyebrow,
  title,
  description,
  action,
  children,
  search = "",
  status = "",
  mine = false,
  statusOptions = [],
  showMine = false,
  resultCount,
}: ModulePageProps) {
  const hasFilters = Boolean(search || status || mine);

  return (
    <>
      <header className="topbar module-top">
        <div>
          <p>{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <Link className="primary" href="?nieuw=1">
          <Plus size={17} />
          {action}
        </Link>
      </header>
      <div className="module-body">
        <p className="lead">{description}</p>
        <form className="toolbar module-filters" method="get">
          <label className="search">
            <Search size={16} />
            <span className="sr-only">Zoeken</span>
            <input
              name="zoek"
              defaultValue={search}
              placeholder="Zoeken op naam of titel..."
            />
          </label>
          {statusOptions.length > 0 && (
            <label>
              <span className="sr-only">Status</span>
              <select className="filter" name="status" defaultValue={status}>
                <option value="">Alle statussen</option>
                {statusOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showMine && (
            <label className={`mine-filter ${mine ? "active" : ""}`}>
              <input
                type="checkbox"
                name="van_mij"
                value="1"
                defaultChecked={mine}
              />
              Mijn items
            </label>
          )}
          <button className="filter filter-submit" type="submit">
            Filteren
          </button>
          {hasFilters && (
            <Link className="filter filter-reset" href="?">
              <X size={14} />
              Wissen
            </Link>
          )}
          {typeof resultCount === "number" && (
            <span className="filter-count">
              {resultCount} {resultCount === 1 ? "resultaat" : "resultaten"}
            </span>
          )}
        </form>
        {children}
      </div>
    </>
  );
}
