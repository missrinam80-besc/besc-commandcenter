"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive, BarChart3, Bell, BookOpen, Bot, Boxes, CalendarDays, CheckCircle2,
  ChevronDown, CircleDollarSign, CircleUserRound, Clapperboard, Clock3, CloudCog,
  FolderKanban, Handshake, Inbox, ListChecks, Landmark, LayoutDashboard, LogOut,
  Mail, Megaphone, Menu, Newspaper, CircleHelp, ShieldCheck, ShoppingBag, Sparkles, UserRoundSearch, Users,
} from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AppShellData } from "@/lib/app-shell-context";
import { signOut } from "@/app/auth/actions";
import { GlobalSearchTrigger } from "@/components/global-search-trigger";
import {
  type FinanceRole,
  type OrganizationRole,
} from "@/lib/permissions";

type NavigationItem = {
  label: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
  roles?: OrganizationRole[];
  financeRoles?: FinanceRole[];
  counter?: "inbox" | "approvals";
  tickets?: boolean;
};
type NavigationGroup = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Mijn werkplek",
    icon: LayoutDashboard,
    items: [
      { label: "Mijn werk", href: "/app/taken", icon: CheckCircle2 },
      { label: "Inbox", href: "/app/inbox", icon: Inbox, roles: ["admin", "board", "member"], counter: "inbox" },
      { label: "Kalender", href: "/app/kalender", icon: CalendarDays },
      { label: "Kost indienen", href: "/app/financien?nieuw=kost", icon: CircleDollarSign },
      { label: "Goedkeuringen", href: "/app/goedkeuringen", icon: CheckCircle2, roles: ["admin", "board", "member"], counter: "approvals" },
      { label: "Discordtickets", href: "/app/tickets", icon: Mail, tickets: true },
    ],
  },
  {
    label: "Planning & uitvoering",
    icon: FolderKanban,
    items: [
      { label: "Projecten", href: "/app/projecten", icon: FolderKanban, roles: ["admin", "board", "member"] },
      { label: "Events", href: "/app/events", icon: CalendarDays, roles: ["admin", "board", "member"] },
      { label: "Campagnes", href: "/app/campagnes", icon: Megaphone, roles: ["admin", "board", "member"] },
      { label: "Social planning", href: "/app/social", icon: Megaphone, roles: ["admin", "board", "member"] },
    ],
  },
  {
    label: "Relaties & communicatie",
    icon: Handshake,
    items: [
      { label: "Community & vrijwilligers", href: "/app/community", icon: UserRoundSearch, roles: ["admin", "board", "member"] },
      { label: "Sponsors & CRM", href: "/app/sponsors", icon: Handshake, roles: ["admin", "board", "member"] },
      { label: "Communicatie", href: "/app/communicatie", icon: Mail, roles: ["admin", "board", "member"] },
    ],
  },
  {
    label: "Content & publicatie",
    icon: Clapperboard,
    items: [
      { label: "Content", href: "/app/content", icon: Clapperboard, roles: ["admin", "board", "member"] },
      { label: "Shop & merchandise", href: "/app/shop", icon: ShoppingBag, roles: ["admin", "board", "member"] },
      { label: "Nieuwsbrieven", href: "/app/nieuwsbrieven", icon: Newspaper, roles: ["admin", "board", "member"] },
      { label: "AI Hub", href: "/app/ai-hub", icon: Bot, roles: ["admin", "board", "member"] },
    ],
  },
  {
    label: "Organisatie",
    icon: BookOpen,
    items: [
      { label: "Vergaderingen & besluiten", href: "/app/vergaderingen", icon: Landmark, roles: ["admin", "board", "member"] },
      { label: "VZW-administratie", href: "/app/administratie", icon: Landmark, roles: ["admin", "board"] },
      { label: "Financiën", href: "/app/financien", icon: CircleDollarSign, roles: ["admin", "board"], financeRoles: ["submitter", "approver", "treasurer", "approver_treasurer"] },
      { label: "Materialen & resources", href: "/app/materialen", icon: Boxes, roles: ["admin", "board", "member"] },
      { label: "Documenten & Drive", href: "/app/documenten", icon: BookOpen, roles: ["admin", "board", "member"] },
      { label: "Kennisbank", href: "/app/kennisbank", icon: BookOpen },
    ],
  },
  {
    label: "Inzichten",
    icon: BarChart3,
    items: [
      { label: "Rapportage & KPI", href: "/app/rapportage", icon: BarChart3, roles: ["admin", "board"] },
      { label: "Social inzichten", href: "/app/rapportage/social", icon: BarChart3, roles: ["admin", "board", "member"] },
      { label: "Management overzicht", href: "/app/rapportage/management", icon: BarChart3, roles: ["admin", "board"] },
      { label: "Sponsorrapportage", href: "/app/rapportage/sponsors", icon: Handshake, roles: ["admin", "board", "member"] },
      { label: "Streamerrapportage", href: "/app/rapportage/creators", icon: UserRoundSearch, roles: ["admin", "board", "member"] },
    ],
  },
  {
    label: "Beheer",
    icon: CloudCog,
    items: [
      { label: "Integraties", href: "/app/integraties", icon: CloudCog, roles: ["admin"] },
      { label: "CSV-import", href: "/app/beheer/import", icon: FolderKanban, roles: ["admin"] },
      { label: "Rechtencontrole", href: "/app/beheer/rechten", icon: ShieldCheck, roles: ["admin"] },
      { label: "Keuzevelden", href: "/app/beheer/keuzevelden", icon: ListChecks, roles: ["admin"] },
      { label: "Archief", href: "/app/archief", icon: Archive, roles: ["admin", "board", "member"] },
      { label: "Historiek", href: "/app/historiek", icon: Archive, roles: ["admin", "board", "member"] },
      { label: "Activiteit", href: "/app/activiteit", icon: Clock3, roles: ["admin", "board", "member"] },
      { label: "Gebruikers & toegang", href: "/app/beheer/gebruikers", icon: Users, roles: ["admin"] },
    ],
  },
];

const helpSearchByActive: Record<string, string> = {
  Home: "Start hier",
  Meldingen: "Meldingen",
  "Mijn werk": "Taken",
  Inbox: "Inbox",
  Kalender: "Calendar",
  Goedkeuringen: "Goedkeuringen",
  Projecten: "Projecten",
  Events: "Events",
  Campagnes: "Campagnes",
  "Social planning": "Social planning",
  "Community & vrijwilligers": "Community",
  "Sponsors & CRM": "Sponsors",
  Communicatie: "E-mail",
  Content: "Content",
  "Shop & merchandise": "Shop",
  Nieuwsbrieven: "Nieuwsbrieven",
  "AI Hub": "AI Hub",
  "Vergaderingen & besluiten": "Vergaderingen",
  "VZW-administratie": "VZW-administratie",
  "Financiën": "Financien",
  "Materialen & resources": "Materialen resources inventaris",
  Kennisbank: "Start hier",
  "Rapportage & KPI": "Rapportage",
  "Documenten & Drive": "Drive",
  Integraties: "Integraties",
  Rechtencontrole: "Rollen rechten",
  Archief: "Archiveren",
  Historiek: "Historiek",
  Activiteit: "Activiteit",
  "Gebruikers & toegang": "Rollen rechten",
  Account: "Account",
};

function helpHref(active: string) {
  if (["Rechtencontrole", "Gebruikers & toegang"].includes(active)) return "https://github.com/missrinam80-besc/besc-commandcenter/blob/main/docs/wiki/Rollen-en-profielen.md";
  const query = helpSearchByActive[active] || active || "Start hier";
  return `/app/kennisbank?zoeken=${encodeURIComponent(query)}`;
}

function canSeeItem(item: NavigationItem, role: OrganizationRole, financeRole: FinanceRole, canManageTickets: boolean) {
  if (item.tickets) return canManageTickets;
  if (!item.roles && !item.financeRoles) return true;
  return Boolean(item.roles?.includes(role) || item.financeRoles?.includes(financeRole));
}

function Navigation({
  active,
  role,
  financeRole,
  inboxCount,
  approvalCount,
  canManageTickets,
}: {
  active: string;
  role: OrganizationRole;
  financeRole: FinanceRole;
  inboxCount: number;
  approvalCount: number;
  canManageTickets: boolean;
}) {
  return (
    <nav className="navigation-groups" aria-label="Hoofdnavigatie">
      {navigationGroups.map((group, index) => {
        const items = group.items.filter((item) => canSeeItem(item, role, financeRole, canManageTickets));
        const containsActive = items.some((item) => item.label === active);
        if (!items.length) return null;
        const GroupIcon = group.icon;
        return (
          <NavigationGroupDisclosure initiallyOpen={index === 0} containsActive={containsActive} label={group.label} key={group.label}>
            <summary>
              <span><GroupIcon size={16}/>{group.label}</span>
              <ChevronDown className="group-chevron" size={15}/>
            </summary>
            <div className="navigation-items">
              {items.map((item) => {
                const Icon = item.icon;
                const count = item.counter === "inbox" ? inboxCount : item.counter === "approvals" ? approvalCount : 0;
                return (
                  <Link className={active === item.label ? "active" : ""} href={item.href} aria-current={active === item.label ? "page" : undefined} key={`${group.label}:${item.label}:${item.href}`}>
                    <Icon size={17}/>
                    <span>{item.label}</span>
                    {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
                  </Link>
                );
              })}
            </div>
          </NavigationGroupDisclosure>
        );
      })}
    </nav>
  );
}

function PrimaryNavigation({
  active,
  notificationCount,
}: {
  active: string;
  notificationCount: number;
}) {
  return (
    <nav className="sidebar-primary" aria-label="Snelle navigatie">
      <Link className={active === "Meldingen" ? "active" : ""} href="/app/meldingen">
        <Bell size={17}/><span>Meldingen</span>
        {notificationCount > 0 && <b>{notificationCount > 99 ? "99+" : notificationCount}</b>}
      </Link>
      <span className="sidebar-divider" aria-hidden="true"/>
      <Link className={active === "Home" ? "active" : ""} href="/app">
        <Sparkles size={17}/><span>Home</span>
      </Link>
    </nav>
  );
}


function NavigationGroupDisclosure({ children, initiallyOpen, containsActive, label }: {
  children: ReactNode; initiallyOpen: boolean; containsActive: boolean; label: string;
}) {
  const [initialOpen] = useState(initiallyOpen || containsActive);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (containsActive && disclosure.current) disclosure.current.open = true; }, [containsActive]);
  return <details className="navigation-group" aria-label={label} ref={disclosure} open={initialOpen}>{children}</details>;
}

const PageContext = createContext<((data: AppShellData, active: string, pathname: string) => void) | null>(null);

export function AppShellPageContext({ data, active }: { data: AppShellData; active: string }) {
  const update = useContext(PageContext);
  const pathname = usePathname();
  useLayoutEffect(() => { update?.(data, active, pathname); }, [update, data, active, pathname]);
  return null;
}

function activeForPath(pathname: string) {
  if (pathname === "/app") return "Home";
  if (pathname.startsWith("/app/account")) return "Account";
  if (pathname.startsWith("/app/meldingen")) return "Meldingen";
  if (pathname.startsWith("/app/documenten")) return "Documenten & Drive";
  if (pathname.startsWith("/app/zoeken")) return "Zoeken";
  return navigationGroups.flatMap(group => group.items)
    .filter(item => !item.href.includes("?") && (pathname === item.href || pathname.startsWith(item.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.label || "Home";
}

export function PersistentAppShell({ children, initialData }: { children: ReactNode; initialData: AppShellData }) {
  const pathname = usePathname();
  const [page, setPage] = useState<{ data: AppShellData; active: string; pathname: string } | null>(null);
  const update = useState(() => (data: AppShellData, active: string, pathname: string) => setPage({ data, active, pathname }))[0];
  const data = page?.data || initialData;
  const active = page?.pathname === pathname ? page.active : activeForPath(pathname);
  const { membershipRole, financeRole, name, role, inboxCount, notificationCount, approvalCount } = data;
  const mobileNavigation = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (mobileNavigation.current) mobileNavigation.current.open = false; }, [pathname]);
  return (
    <PageContext.Provider value={update}>
    <main className="app-shell" data-role={membershipRole} data-active={active} data-theme={data.theme}>
      <aside className="sidebar">
        <Link className="brand" href="/app" aria-label="BESC Command Center home">
          <Image src="/besc-logo.png" width={875} height={286} priority alt="BESC"/>
          <span>Command Center</span>
        </Link>
        <PrimaryNavigation active={active} notificationCount={notificationCount ?? 0}/>
        <Navigation canManageTickets={data.canManageTickets} active={active} role={membershipRole} financeRole={financeRole} inboxCount={inboxCount ?? 0} approvalCount={approvalCount ?? 0}/>
        <div className="sidebar-utility">
          <Link className="context-help-link" href={helpHref(active)}>
            <CircleHelp size={17}/><span>Help bij deze pagina</span>
          </Link>
          <GlobalSearchTrigger active={active === "Zoeken"}/>
        </div>
        <div className="user">
          <Link className={`user-profile-link ${active === "Account" ? "active" : ""}`} href="/app/account" aria-label="Mijn account openen">
            <div className="avatar">{name.slice(0, 2).toUpperCase()}</div>
            <div><strong>{name}</strong><span>{role}</span></div>
            <CircleUserRound size={17}/>
          </Link>
          <form action={signOut}>
            <button className="logout-button" title="Uitloggen" aria-label="Uitloggen"><LogOut size={16}/></button>
          </form>
        </div>
      </aside>
      <details className="mobile-navigation" ref={mobileNavigation}>
        <summary><Menu size={18}/><span>Menu</span></summary>
        <div className="mobile-navigation-panel">
          <div className="mobile-navigation-brand">
            <Image src="/besc-logo.png" width={875} height={286} alt="BESC"/>
            <span>{name} · {role}</span>
          </div>
          <PrimaryNavigation active={active} notificationCount={notificationCount ?? 0}/>
          <Navigation canManageTickets={data.canManageTickets} active={active} role={membershipRole} financeRole={financeRole} inboxCount={inboxCount ?? 0} approvalCount={approvalCount ?? 0}/>
          <div className="mobile-navigation-search">
            <Link className="context-help-link" href={helpHref(active)}>
              <CircleHelp size={17}/>Help bij deze pagina
            </Link>
            <GlobalSearchTrigger active={active === "Zoeken"}/>
          </div>
          <Link className={active === "Account" ? "active" : ""} href="/app/account">
            <CircleUserRound size={17}/>Mijn account
          </Link>
          <form action={signOut}><button><LogOut size={16}/>Uitloggen</button></form>
        </div>
      </details>
      <section className="workspace">{children}</section>
    </main>
    </PageContext.Provider>
  );
}
