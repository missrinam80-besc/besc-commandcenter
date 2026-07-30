import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { updateOperationalRecord } from "@/app/app/operations/actions";
import { operationalModules, type OperationalModule } from "@/app/app/operations/config";
import { AppShell } from "@/components/app-shell";
import { ApprovalPanel } from "@/components/approval-panel";
import { OperationalRecordForm } from "@/components/operational-record-form";
import { RecordLifecyclePanel } from "@/components/record-lifecycle-panel";
import {
  CampaignSections,
  CommunitySections,
  PartnerSections,
  SocialRelations,
} from "@/components/operational-sections";
import { requireActiveMembership } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";

type Row = {
  id: string;
  status: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};
type RelatedRow = { id: string; [key: string]: unknown };

const lifecycleEntity = {
  sponsors: "partner",
  campagnes: "campaign",
  community: "communityPerson",
  social: "socialPost",
} as const;

export async function OperationalRecordDetail({
  module,
  params,
  searchParams,
}: {
  module: OperationalModule;
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const config = operationalModules[module];
  const { supabase, membership } = await requireActiveMembership();
  const org = membership.organization_id;

  const [
    recordResult,
    projectsResult,
    partnersResult,
    contentResult,
    campaignOptionsResult,
    eventsResult,
    contactsResult,
    interactionsResult,
    deliverablesResult,
    onboardingResult,
    assignmentsResult,
    socialResult,
    partnerCampaignsResult,
    variantsResult,
  ] = await Promise.all([
    supabase.from(config.table).select("*").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("projects").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("partners").select("id,name").eq("organization_id", org).is("deleted_at", null).order("name"),
    supabase.from("content_items").select("id,title,status").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("campaigns").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("events").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    module === "sponsors" ? supabase.from("partner_contacts").select("*").eq("organization_id", org).eq("partner_id", id).order("is_primary", { ascending: false }) : Promise.resolve({ data: [] }),
    module === "sponsors" ? supabase.from("partner_interactions").select("*").eq("organization_id", org).eq("partner_id", id).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [] }),
    module === "campagnes" ? supabase.from("campaign_deliverables").select("*").eq("organization_id", org).eq("campaign_id", id).order("due_date") : Promise.resolve({ data: [] }),
    module === "community" ? supabase.from("community_onboarding_items").select("*").eq("organization_id", org).eq("person_id", id).order("created_at") : Promise.resolve({ data: [] }),
    module === "community" ? supabase.from("community_assignments").select("*").eq("organization_id", org).eq("person_id", id).order("starts_at") : Promise.resolve({ data: [] }),
    module === "campagnes" ? supabase.from("social_posts").select("id,title,platform,status").eq("organization_id", org).eq("campaign_id", id).is("deleted_at", null) : Promise.resolve({ data: [] }),
    module === "sponsors" ? supabase.from("campaigns").select("id,title,status").eq("organization_id", org).eq("partner_id", id).is("deleted_at", null) : Promise.resolve({ data: [] }),
    module === "social" ? supabase.from("social_post_variants").select("*").eq("organization_id", org).eq("social_post_id", id).order("platform") : Promise.resolve({ data: [] }),
  ]);

  if (!recordResult.data) notFound();
  const record = recordResult.data as Row;
  const title = String(record[config.titleColumn]);
  const typeLabel = config.types[String(record[config.typeColumn]) as keyof typeof config.types] ?? String(record[config.typeColumn]);
  const statusLabel = config.statuses[record.status as keyof typeof config.statuses] ?? record.status;
  const externalUrl = String(record[config.urlColumn] ?? "");

  return (
    <AppShell active={config.label}>
      <header className="project-detail-head">
        <div>
          <Link href={`/app/${module}`}>← Terug naar {config.label}</Link>
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>{title}</h1>
          <p>{typeLabel} · {statusLabel}</p>
        </div>
        <div className="project-actions">
          {externalUrl && <a href={externalUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open gekoppeld bestand</a>}
          {!query.bewerken && <Link className="primary" href="?bewerken=1">Bewerken</Link>}
        </div>
      </header>
      <div className="project-detail-body">
        {query.fout && <div className="error-note">De wijziging kon niet worden opgeslagen ({query.fout}).</div>}
        {query.succes && <div className="success">De wijziging is opgeslagen.</div>}
        {query.bewerken ? (
          <section className="form-card">
            <div className="form-heading"><h2>{title} bewerken</h2><Link href="?">Annuleren</Link></div>
            <OperationalRecordForm action={updateOperationalRecord} module={module} record={record} projects={projectsResult.data ?? []} partners={partnersResult.data ?? []} content={contentResult.data ?? []} campaigns={campaignOptionsResult.data ?? []} events={eventsResult.data ?? []}/>
          </section>
        ) : (
          <>
            <section className="project-summary">
              <article><span>Type</span><strong>{typeLabel}</strong></article>
              <article><span>Status</span><strong>{statusLabel}</strong></article>
              <article><span>Aangemaakt</span><strong>{record.created_at.slice(0, 10)}</strong></article>
              <article><span>Laatst aangepast</span><strong>{record.updated_at.slice(0, 10)}</strong></article>
            </section>
            {module !== "social" && <section className="form-card record-notes"><div className="form-heading"><h2>Notities en briefing</h2></div><p>{String(record.notes ?? "Nog geen notities toegevoegd.")}</p></section>}
            {module === "sponsors" && <ApprovalPanel entityType="partner" entityId={id} sourceHref={`/app/sponsors/${id}`} title="Sponsorafspraak goedkeuren"/>}
            {module === "sponsors" && <PartnerSections id={id} contacts={(contactsResult.data ?? []) as unknown as RelatedRow[]} interactions={(interactionsResult.data ?? []) as unknown as RelatedRow[]} campaigns={(partnerCampaignsResult.data ?? []) as unknown as RelatedRow[]} events={[]} content={[]}/>}
            {module === "campagnes" && <CampaignSections id={id} deliverables={(deliverablesResult.data ?? []) as unknown as RelatedRow[]} social={(socialResult.data ?? []) as unknown as RelatedRow[]} content={[]}/>}
            {module === "community" && <CommunitySections id={id} onboarding={(onboardingResult.data ?? []) as unknown as RelatedRow[]} assignments={(assignmentsResult.data ?? []) as unknown as RelatedRow[]} events={(eventsResult.data ?? []) as unknown as RelatedRow[]} projects={(projectsResult.data ?? []) as unknown as RelatedRow[]}/>}
            {module === "social" && <SocialRelations record={record} variants={(variantsResult.data ?? []) as unknown as RelatedRow[]}/>}
            <RecordLifecyclePanel
              entity={lifecycleEntity[module]}
              id={id}
              label={config.singular[0].toUpperCase() + config.singular.slice(1)}
              isArchived={record.status === "archived"}
              canManage={hasPermission(membership, "manageOrganization")}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
