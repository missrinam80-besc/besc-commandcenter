import Link from "next/link";

const items = [
  { label: "Overzicht", href: "/app/financien", managerOnly: false },
  { label: "Rapportage", href: "/app/financien/rapportage", managerOnly: true },
  { label: "Boekhoudstukken", href: "/app/financien/documenten", managerOnly: true },
  { label: "Instellingen", href: "/app/financien/instellingen", managerOnly: true },
];

export function FinanceNavigation({
  active,
  canManage,
}: {
  active: "overview" | "reporting" | "documents" | "settings";
  canManage: boolean;
}) {
  return (
    <nav className="finance-section-nav" aria-label="Financiële onderdelen">
      {items.filter((item) => canManage || !item.managerOnly).map((item) => (
        <Link className={active === (
          item.href.endsWith("/rapportage") ? "reporting" :
          item.href.endsWith("/documenten") ? "documents" :
          item.href.endsWith("/instellingen") ? "settings" : "overview"
        ) ? "active" : ""} href={item.href} key={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
