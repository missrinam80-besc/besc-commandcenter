import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MarkdownContent } from "@/components/markdown-field";
import { requireActiveMembership } from "@/lib/auth-context";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
  const {id}=await params,q=await searchParams,{supabase,membership}=await requireActiveMembership(),org=membership.organization_id;
  const unifiedEditor = await dossierEditorGate({kind:"product",id,query:q});
  if (unifiedEditor) return unifiedEditor;

  const [recordResult] = await Promise.all([
    supabase.from("shop_products").select("*,supplier:partners!shop_products_supplier_id_fkey(name),producer:partners!shop_products_producer_id_fkey(name),projects(title),campaigns(title)").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle()
  ]); if(!recordResult.data)notFound(); const r=recordResult.data;
  return <AppShell active="Shop & merchandise"><header className="project-detail-head"><div><Link href="/app/shop">← Terug naar Shop & merchandise</Link><span className="eyebrow">PRODUCT</span><h1>{r.name}</h1><p>{r.product_family==="merchandise"?"Merchandise":"Stream Graphics Shop"} · {r.status}</p></div><div className="project-actions">{r.shop_url&&<a href={r.shop_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open shoplink</a>}{<Link className="primary" href="?bewerken=1">Bewerken</Link>}</div></header><div className="project-detail-body">{q.succes&&<div className="success">Wijziging opgeslagen.</div>}{<><section className="project-summary"><article><span>Type</span><strong>{r.product_type}</strong></article><article><span>Status</span><strong>{r.status}</strong></article><article><span>Prijs</span><strong>{r.price!=null?`€ ${Number(r.price).toFixed(2)}`:"—"}</strong></article><article><span>Platformen</span><strong>{(r.platforms??[]).join(", ")||"—"}</strong></article></section><section className="form-card record-notes"><div className="form-heading"><h2>Beschrijving</h2>{r.asset_url&&<a href={r.asset_url} target="_blank" rel="noreferrer">Open assets</a>}</div>{r.description?<MarkdownContent>{r.description}</MarkdownContent>:<p>Nog geen beschrijving.</p>}<p className="form-help">Leverancier: {r.supplier?.name||"geen"} · Producent: {r.producer?.name||"geen"} · Project: {r.projects?.title||"geen"} · Campagne: {r.campaigns?.title||"geen"}</p></section></>}</div></AppShell>;
}
