import { dossierEditorGate } from "@/components/dossier-editor-gate";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FormModal } from "@/components/form-modal";
import { MarkdownContent } from "@/components/markdown-field";
import { ProductForm } from "@/components/shop-forms";
import { requireActiveMembership } from "@/lib/auth-context";

export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
  const {id}=await params,q=await searchParams,{supabase,membership}=await requireActiveMembership(),org=membership.organization_id;
  const unifiedEditor = await dossierEditorGate({kind:"product",id,query:q});
  if (unifiedEditor) return unifiedEditor;

  const [recordResult,partnersResult,projectsResult,campaignsResult]=await Promise.all([
    supabase.from("shop_products").select("*,supplier:partners!shop_products_supplier_id_fkey(name),producer:partners!shop_products_producer_id_fkey(name),projects(title),campaigns(title)").eq("organization_id",org).eq("id",id).is("deleted_at",null).maybeSingle(),
    supabase.from("partners").select("id,name").eq("organization_id",org).is("deleted_at",null).order("name"),supabase.from("projects").select("id,title").eq("organization_id",org).is("deleted_at",null).order("title"),supabase.from("campaigns").select("id,title").eq("organization_id",org).is("deleted_at",null).order("title"),
  ]); if(!recordResult.data)notFound(); const r=recordResult.data,options={partners:partnersResult.data??[],projects:projectsResult.data??[],campaigns:campaignsResult.data??[]};
  return <AppShell active="Shop & merchandise"><header className="project-detail-head"><div><Link href="/app/shop">← Terug naar Shop & merchandise</Link><span className="eyebrow">PRODUCT</span><h1>{r.name}</h1><p>{r.product_family==="merchandise"?"Merchandise":"Stream Graphics Shop"} · {r.status}</p></div><div className="project-actions">{r.shop_url&&<a href={r.shop_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open shoplink</a>}{!q.bewerken&&<Link className="primary" href="?bewerken=1">Bewerken</Link>}</div></header><div className="project-detail-body">{q.succes&&<div className="success">Wijziging opgeslagen.</div>}{q.bewerken?<FormModal title="Product bewerken"><ProductForm record={r} options={options}/></FormModal>:<><section className="project-summary"><article><span>Type</span><strong>{r.product_type}</strong></article><article><span>Status</span><strong>{r.status}</strong></article><article><span>Prijs</span><strong>{r.price!=null?`€ ${Number(r.price).toFixed(2)}`:"—"}</strong></article><article><span>Platformen</span><strong>{(r.platforms??[]).join(", ")||"—"}</strong></article></section><section className="form-card record-notes"><div className="form-heading"><h2>Beschrijving</h2>{r.asset_url&&<a href={r.asset_url} target="_blank" rel="noreferrer">Open assets</a>}</div>{r.description?<MarkdownContent>{r.description}</MarkdownContent>:<p>Nog geen beschrijving.</p>}<p className="form-help">Leverancier: {r.supplier?.name||"geen"} · Producent: {r.producer?.name||"geen"} · Project: {r.projects?.title||"geen"} · Campagne: {r.campaigns?.title||"geen"}</p></section></>}</div></AppShell>;
}
