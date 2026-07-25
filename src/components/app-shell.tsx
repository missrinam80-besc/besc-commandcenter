import Image from "next/image";
import Link from "next/link";
import {
  Archive, BarChart3, Bell, BookOpen, Bot, CalendarDays, CheckCircle2,
  ChevronDown, CircleDollarSign, Clapperboard, Clock3, CloudCog,
  FolderKanban, Handshake, Inbox, Landmark, LayoutDashboard, LogOut,
  Megaphone, Menu, ShoppingBag, Sparkles, UserRoundSearch, Users,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { signOut } from "@/app/auth/actions";
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
  counter?: "inbox";
};
type NavigationGroup = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Dagelijks werk",
    icon: LayoutDashboard,
    items: [
      { label: "Home", href: "/app", icon: Sparkles },
      { label: "Inbox", href: "/app/inbox", icon: Inbox, counter: "inbox" },
      { label: "Mijn werk", href: "/app/taken", icon: CheckCircle2 },
      { label: "Projecten", href: "/app/projecten", icon: FolderKanban },
      { label: "Kalender", href: "/app/kalender", icon: CalendarDays },
    ],
  },
  {
    label: "Organisatie",
    icon: Users,
    items: [
      { label: "Community & vrijwilligers", href: "/app/community", icon: UserRoundSearch },
      { label: "Vergaderingen & besluiten", href: "/app/vergaderingen", icon: Landmark },
      { label: "Kennisbank", href: "/app/kennisbank", icon: BookOpen },
      { label: "VZW-administratie", href: "/app/administratie", icon: Landmark, roles: ["admin", "board"] },
      { label: "Gebruikers", href: "/app/beheer/gebruikers", icon: Users, roles: ["admin"] },
    ],
  },
  {
    label: "Content & groei",
    icon: Megaphone,
    items: [
      { label: "Content", href: "/app/content", icon: Clapperboard },
      { label: "Social planning", href: "/app/social", icon: Megaphone },
      { label: "Campagnes", href: "/app/campagnes", icon: Megaphone },
      { label: "Events", href: "/app/events", icon: CalendarDays },
      { label: "Sponsors & CRM", href: "/app/sponsors", icon: Handshake, roles: ["admin", "board", "member"] },
      { label: "Shop & merchandise", href: "/app/shop", icon: ShoppingBag, roles: ["admin", "board", "member"] },
    ],
  },
  {
    label: "Financiën",
    icon: CircleDollarSign,
    items: [
      { label: "Financiën", href: "/app/financien", icon: CircleDollarSign, roles: ["admin", "board"], financeRoles: ["submitter", "approver", "treasurer"] },
      { label: "Financieel rapport", href: "/app/financien/rapportage", icon: BarChart3, roles: ["admin", "board"], financeRoles: ["approver", "treasurer"] },
      { label: "Boekhoudstukken", href: "/app/financien/documenten", icon: FolderKanban, roles: ["admin", "board"], financeRoles: ["submitter", "approver", "treasurer"] },
      { label: "Financiële instellingen", href: "/app/financien/instellingen", icon: CloudCog, roles: ["admin", "board"], financeRoles: ["approver", "treasurer"] },
    ],
  },
  {
    label: "Inzicht & tools",
    icon: BarChart3,
    items: [
      { label: "Rapportage & KPI", href: "/app/rapportage", icon: BarChart3 },
      { label: "AI Hub", href: "/app/ai-hub", icon: Bot },
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
}: {
  active: string;
  role: OrganizationRole;
  financeRole: FinanceRole;
  inboxCount: number;
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
                const count = item.counter === "inbox" ? inboxCount : 0;
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
  const [{ data: profile }, { count: inboxCount }, { count: notificationCount }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).is("deleted_at", null).in("status", ["new", "reviewing"]),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);

  const membershipRole = membership.role as OrganizationRole;
  const financeRole = membership.finance_role as FinanceRole;
  const name = providedName || profile?.display_name || user.email?.split("@")[0] || "Gebruiker";
  const role = providedRole || organizationRoleLabels[membershipRole] || "Teamlid";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/app" aria-label="BESC Command Center home">
          <Image src="/besc-logo.png" width={875} height={286} priority alt="BESC"/>
          <span>Command Center</span>
        </Link>
        <Navigation active={active} role={membershipRole} financeRole={financeRole} inboxCount={inboxCount ?? 0}/>
        <div className="sidebar-utility">
          <Link className={active === "Meldingen" ? "active" : ""} href="/app/meldingen">
            <Bell size={17}/><span>Meldingen</span>
            {(notificationCount ?? 0) > 0 && <b>{(notificationCount ?? 0) > 99 ? "99+" : notificationCount}</b>}
          </Link>
        </div>
        <div className="user">
          <div className="avatar">{name.slice(0, 2).toUpperCase()}</div>
          <div><strong>{name}</strong><span>{role}</span></div>
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
          <Navigation active={active} role={membershipRole} financeRole={financeRole} inboxCount={inboxCount ?? 0}/>
          <Link className={active === "Meldingen" ? "active" : ""} href="/app/meldingen">
            <Bell size={17}/>Meldingen{(notificationCount ?? 0) > 0 && <b>{notificationCount}</b>}
          </Link>
          <form action={signOut}><button><LogOut size={16}/>Uitloggen</button></form>
        </div>
      </details>
      <section className="workspace">{children}</section>
    </main>
  );
}
