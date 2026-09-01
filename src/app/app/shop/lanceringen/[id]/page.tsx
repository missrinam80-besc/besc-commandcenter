import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FormModal } from "@/components/form-modal";
import { MarkdownContent } from "@/components/markdown-field";
import { LaunchForm } from "@/components/shop-forms";
import { requireActiveMembership } from "@/lib/auth-context";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
  const {id}=await params,q=await searchParams,{supabase,membership}=await requireActiveMembership(),org=membership.organization_id;
  const [recordResult,partnersResult,projectsResult,campaignsResult]=await Promise.all([
    supabase.from("merch_launches").select("*,projects(title),campaigns(title),partners(name)").eq("organization_id",org).eq("id",id).is("deleted_at",null).maybeSingle(),supabase.from("partners").select("id,name").eq("organization_id",org).is("deleted_at",null).order("name"),supabase.from("projects").select("id,title").eq("organization_id",org).is("deleted_at",null).order("title"),supabase.from("campaigns").select("id,title").eq("organization_id",org).is("deleted_at",null).order("title"),
  ]); if(!recordResult.data)notFound();const r=recordResult.data,options={partners:partnersResult.data??[],projects:projectsResult.data??[],campaigns:campaignsResult.data??[]};
  return <AppShell active="Shop & merchandise"><header className="project-detail-head"><div><Link href="/app/shop">← Terug naar Shop & merchandise</Link><span className="eyebrow">MERCHLANCERING</span><h1>{r.title}</h1><p>{r.collection_name||"Geen collectie"} · {r.status}</p></div><div className="project-actions">{r.drive_url&&<a href={r.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open Drive-map</a>}{!q.bewerken&&<Link className="primary" href="?bewerken=1">Bewerken</Link>}</div></header><div className="project-detail-body">{q.succes&&<div className="success">Wijziging opgeslagen.</div>}{q.bewerken?<FormModal title="Lancering bewerken"><LaunchForm record={r} options={options}/></FormModal>:<><section className="project-summary"><article><span>Collectie</span><strong>{r.collection_name||"—"}</strong></article><article><span>Status</span><strong>{r.status}</strong></article><article><span>Lanceringsdatum</span><strong>{r.launch_date||"—"}</strong></article><article><span>Timing</span><strong>{r.timing||"—"}</strong></article></section><section className="form-card record-notes"><div className="form-heading"><h2>Beschrijving en planning</h2></div>{r.description?<MarkdownContent>{r.description}</MarkdownContent>:<p>Nog geen beschrijving.</p>}<p className="form-help">Project: {r.projects?.title||"geen"} · Campagne: {r.campaigns?.title||"geen"} · Partner/producent: {r.partners?.name||"geen"}</p></section></>}</div></AppShell>;
}
