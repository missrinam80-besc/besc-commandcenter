import Link from "next/link";
import { Bell, CalendarDays, CheckCircle2, Clock3, FolderKanban, Inbox, LogOut, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth/actions";

const nav = [["Home", "/app", Sparkles], ["Inbox", "/app/inbox", Inbox], ["Mijn werk", "/app/taken", CheckCircle2], ["Projecten", "/app/projecten", FolderKanban]] as const;

export function AppShell({ children, active = "Home", name = "Linda", role = "Beheerder" }: { children: ReactNode; active?: string; name?: string; role?: string }) {
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">B</div><div><strong>BESC</strong><span>Command Center</span></div></div><nav>{nav.map(([label, href, Icon]) => <Link className={active === label ? "active" : ""} href={href} key={label}><Icon size={18}/>{label}{label === "Inbox" && <b>6</b>}</Link>)}</nav><div className="sidebar-section"><span>WERKRUIMTE</span><Link className={active === "Meldingen" ? "active" : ""} href="/app/meldingen"><Bell size={18}/>Meldingen</Link><a href="#"><CalendarDays size={18}/>Kalender</a><a href="#"><Clock3 size={18}/>Activiteit</a>{role === "Beheerder" && <Link className={active === "Gebruikers" ? "active" : ""} href="/app/beheer/gebruikers"><Users size={18}/>Gebruikers</Link>}</div><div className="user"><div className="avatar">{name.slice(0,2).toUpperCase()}</div><div><strong>{name}</strong><span>{role}</span></div><form action={signOut}><button className="logout-button" title="Uitloggen" aria-label="Uitloggen"><LogOut size={16}/></button></form></div></aside><section className="workspace">{children}</section><form className="mobile-logout" action={signOut}><button><LogOut size={16}/>Uitloggen</button></form></main>;
}
