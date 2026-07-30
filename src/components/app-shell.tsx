import Image from "next/image";
import Link from "next/link";
import {
  Archive, BarChart3, Bell, BookOpen, Bot, CalendarDays, CheckCircle2,
  ChevronDown, CircleDollarSign, CircleUserRound, Clapperboard, Clock3, CloudCog,
  FileText, FolderKanban, Handshake, Inbox, Landmark, LayoutDashboard, LogOut,
  Mail, Megaphone, Menu, Newspaper, ShoppingBag, Sparkles, UserRoundSearch,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
import { GlobalSearchTrigger } from "@/components/global-search-trigger";
import { requireActiveMembership } from "@/lib/auth-context";
import {
  type FinanceRole,
  type OrganizationRole,
  organizationRoleLabels,
} from "@/lib/permissions";

type NavigationItem = {
  label: string;
  href: string;
  icon: ComponentType<{ size?: number }>;
  roles?: OrganizationRole[];
  financeRoles?: FinanceRole[];
  counter?: "inbox" | "approvals";
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
      { label: "Inbox", href: "/app/inbox", icon: Inbox, counter: "inbox" },
      { label: "Kalender", href: "/app/kalender", icon: CalendarDays },
      { label: "Goedkeuringen", href: "/app/goedkeuringen", icon: CheckCircle2, counter: "approvals" },
    ],
  },
  {
    label: "Planning & uitvoering",
    icon: FolderKanban,
    items: [
      { label: "Projecten", href: "/app/projecten", icon: FolderKanban },
      { label: "Events", href: "/app/events", icon: CalendarDays },
      { label: "Campagnes", href: "/app/campagnes", icon: Megaphone },
      { label: "Social planning", href: "/app/social", icon: Megaphone },
    ],
  },
  {
    label: "Relaties & communicatie",
    icon: Handshake,
    items: [
      { label: "Community & vrijwilligers", href: "/app/community", icon: UserRoundSearch },
      { label: "Sponsors & CRM", href: "/app/sponsors", icon: Handshake, roles: ["admin", "board", "member"] },
      { label: "Communicatie", href: "/app/communicatie", icon: Mail },
    ],
  },
  {
    label: "Content & publicatie",
    icon: Clapperboard,
    items: [
      { label: "Content", href: "/app/content", icon: Clapperboard },
      { label: "Shop & merchandise", href: "/app/shop", icon: ShoppingBag, roles: ["admin", "board", "member"] },
      { label: "Nieuwsbrieven", href: "/app/nieuwsbrieven", icon: Newspaper, roles: ["admin", "board"] },
      { label: "AI Hub", href: "/app/ai-hub", icon: Bot },
    ],
  },
  {
    label: "Organisatie",
    icon: BookOpen,
    items: [
      { label: "Vergaderingen & besluiten", href: "/app/vergaderingen", icon: Landmark },
      { label: "VZW-administratie", href: "/app/administratie", icon: Landmark, roles: ["admin", "board"] },
      { label: "Financiën", href: "/app/financien", icon: CircleDollarSign, roles: ["admin", "board"], financeRoles: ["submitter", "approver", "treasurer"] },
      { label: "Kennisbank", href: "/app/kennisbank", icon: BookOpen },
    ],
  },
  {
    label: "Inzichten",
    icon: BarChart3,
    items: [
      { label: "Rapportage & KPI", href: "/app/rapportage", icon: BarChart3 },
    ],
  },
  {
    label: "Beheer",
    icon: CloudCog,
    items: [
      { label: "Documenten & Drive", href: "/app/documenten", icon: FileText },
      { label: "Integraties", href: "/app/integraties", icon: CloudCog, roles: ["admin", "board"] },
      { label: "Historiek", href: "/app/historiek", icon: Archive, roles: ["admin", "board"] },
      { label: "Activiteit", href: "/app/activiteit", icon: Clock3, roles: ["admin", "board"] },
    ],
  },
];

function canSeeItem(item: NavigationItem, role: OrganizationRole, financeRole: FinanceRole) {
  if (!item.roles && !item.financeRoles) return true;
  return Boolean(item.roles?.includes(role) || item.financeRoles?.includes(financeRole));
}

function Navigation({
  active,
  role,
  financeRole,
  inboxCount,
  approvalCount,
}: {
  active: string;
  role: OrganizationRole;
  financeRole: FinanceRole;
  inboxCount: number;
  approvalCount: number;
}) {
  return (
    <nav className="navigation-groups" aria-label="Hoofdnavigatie">
      {navigationGroups.map((group, index) => {
        const items = group.items.filter((item) => canSeeItem(item, role, financeRole));
        const containsActive = items.some((item) => item.label === active);
        if (!items.length) return null;
        const GroupIcon = group.icon;
        return (
          <details className="navigation-group" open={containsActive || index === 0} key={group.label}>
            <summary>
              <span><GroupIcon size={16}/>{group.label}</span>
              <ChevronDown className="group-chevron" size={15}/>
            </summary>
            <div className="navigation-items">
              {items.map((item) => {
                const Icon = item.icon;
                const count = item.counter === "inbox" ? inboxCount : item.counter === "approvals" ? approvalCount : 0;
                return (
                  <Link className={active === item.label ? "active" : ""} href={item.href} key={item.href}>
                    <Icon size={17}/>
                    <span>{item.label}</span>
                    {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
                  </Link>
                );
              })}
            </div>
          </details>
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

export async function AppShell({
  children,
  active = "Home",
  name: providedName,
  role: providedRole,
}: {
  children: ReactNode;
  active?: string;
  name?: string;
  role?: string;
}) {
  const { supabase, user, membership } = await requireActiveMembership();
  await supabase.rpc("refresh_my_notifications");
  let approvalCountQuery = supabase
    .from("approval_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id);
  if (membership.role === "admin" || membership.role === "board" || ["approver", "treasurer"].includes(membership.finance_role)) {
    approvalCountQuery = approvalCountQuery.eq("status", "pending");
  } else {
    approvalCountQuery = approvalCountQuery.eq("requested_by", user.id).in("status", ["pending", "changes_requested"]);
  }
  const [{ data: profile }, { count: inboxCount }, { count: notificationCount }, { count: approvalCount }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).is("deleted_at", null).in("status", ["new", "reviewing"]),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    approvalCountQuery,
  ]);

  const membershipRole = membership.role as OrganizationRole;
  const financeRole = membership.finance_role as FinanceRole;
  const name = providedName || profile?.display_name || user.email?.split("@")[0] || "Gebruiker";
  const role = providedRole || organizationRoleLabels[membershipRole] || "Teamlid";

  return (
    <main className="app-shell" data-role={membershipRole} data-active={active}>
      <aside className="sidebar">
        <Link className="brand" href="/app" aria-label="BESC Command Center home">
          <Image src="/besc-logo.png" width={875} height={286} priority alt="BESC"/>
          <span>Command Center</span>
        </Link>
        <PrimaryNavigation active={active} notificationCount={notificationCount ?? 0}/>
        <Navigation active={active} role={membershipRole} financeRole={financeRole} inboxCount={inboxCount ?? 0} approvalCount={approvalCount ?? 0}/>
        <div className="sidebar-utility">
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
      <details className="mobile-navigation">
        <summary><Menu size={18}/><span>Menu</span></summary>
        <div className="mobile-navigation-panel">
          <div className="mobile-navigation-brand">
            <Image src="/besc-logo.png" width={875} height={286} alt="BESC"/>
            <span>{name} · {role}</span>
          </div>
          <PrimaryNavigation active={active} notificationCount={notificationCount ?? 0}/>
          <Navigation active={active} role={membershipRole} financeRole={financeRole} inboxCount={inboxCount ?? 0} approvalCount={approvalCount ?? 0}/>
          <div className="mobile-navigation-search">
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
  );
}
