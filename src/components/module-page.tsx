import { Plus, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
export function ModulePage({ eyebrow, title, description, action, children }: { eyebrow: string; title: string; description: string; action: string; children: ReactNode }) { return <><header className="topbar module-top"><div><p>{eyebrow}</p><h1>{title}</h1></div><Link className="primary" href="?nieuw=1"><Plus size={17}/>{action}</Link></header><div className="module-body"><p className="lead">{description}</p><div className="toolbar"><div className="search"><Search size={16}/><input placeholder="Zoeken..."/></div><button className="filter">Alle statussen</button><button className="filter">Mijn items</button></div>{children}</div></>; }
