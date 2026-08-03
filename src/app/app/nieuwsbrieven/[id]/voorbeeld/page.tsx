import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";

export default async function NewsletterPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership } = await requireActiveMembership();
  const { data } = await supabase.from("newsletters").select("id,title,subject,body_html")
    .eq("organization_id", membership.organization_id).eq("id", id).maybeSingle();
  if (!data?.body_html) notFound();
  return <AppShell active="Nieuwsbrieven">
    <header className="topbar module-top"><div><p>VEILIGE VOORBEELDWEERGAVE</p><h1>{data.title}</h1></div><Link href={`/app/nieuwsbrieven/${data.id}`}>Terug naar nieuwsbrief</Link></header>
    <div className="module-body newsletter-preview-page">
      <div className="permission-note">Dit voorbeeld draait in een afgeschermd venster. Controleer onderwerp, afbeelding, leesbaarheid en uitschrijflink vóór je goedkeuring vraagt.</div>
      <iframe title={`Voorbeeld van ${data.subject}`} srcDoc={data.body_html} sandbox="" referrerPolicy="no-referrer"/>
    </div>
  </AppShell>;
}
