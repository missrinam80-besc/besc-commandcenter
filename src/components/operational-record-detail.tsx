import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { updateOperationalRecord } from "@/app/app/operations/actions";
import { operationalModules, type OperationalModule } from "@/app/app/operations/config";
import { AppShell } from "@/components/app-shell";
import { ApprovalPanel } from "@/components/approval-panel";
import { FormModal } from "@/components/form-modal";
import { MarkdownContent } from "@/components/markdown-field";
import { OperationalRecordForm } from "@/components/operational-record-form";
import { ContentForm } from "@/components/content-form";
import { RecordLifecyclePanel } from "@/components/record-lifecycle-panel";
import { RecordConnectionsPanel } from "@/components/record-connections-panel";
import { RecordMetadata, type MetadataItem } from "@/components/record-metadata";
import { TaskCreateModal } from "@/components/task-create-modal";
import { FinancialSummaryPanel } from "@/components/financial-summary-panel";
import { SponsorDocumentTools } from "@/components/sponsor-document-tools";
import {
  CampaignSections,
  CommunitySections,
  PartnerSections,
  SocialRelations,
} from "@/components/operational-sections";
import { requireActiveMembership } from "@/lib/auth-context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { loadDossierConnections, loadRelationOptions } from "@/lib/dossier-relations";
import { hasPermission } from "@/lib/permissions";
import { communityRoleLabels } from "@/lib/community-people";
import { createContent } from "@/app/app/content/actions";
import { createOperationalRecord } from "@/app/app/operations/actions";

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
    personRolesResult,
    accountOptionsResult,
    budgetResult,
    expenseResult,
    incomeResult,
    communityOptionsResult,
  ] = await Promise.all([
    supabase.from(config.table).select("*").eq("organization_id", org).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("projects").select("id,title").eq("organization_id", org).is("deleted_at", null).order("title"),
    supabase.from("partners").select("id,name").eq("organization_id", org).is("deleted_at", null).order("name"),
    supabase.from("content_items").select("id,title,status,campaign_id").eq("organization_id", org).is("deleted_at", null).order("title"),
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
    module === "community" ? supabase.from("community_person_roles").select("role").eq("organization_id", org).eq("person_id", id).order("role") : Promise.resolve({ data: [] }),
    supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", org).eq("status", "active"),
    module === "campagnes" ? supabase.from("budget_envelopes").select("id,name,planned_amount,status").eq("organization_id", org).eq("campaign_id", id).is("deleted_at", null).order("created_at") : Promise.resolve({ data: [] }),
    module === "campagnes" ? supabase.from("expenses").select("id,title,amount,status").eq("organization_id", org).eq("campaign_id", id).is("deleted_at", null).order("expense_date", { ascending: false }) : Promise.resolve({ data: [] }),
    module === "campagnes" ? supabase.from("income_entries").select("id,title,amount,status").eq("organization_id", org).eq("campaign_id", id).is("deleted_at", null).order("expected_date", { ascending: false }) : Promise.resolve({ data: [] }),
    module === "campagnes" ? supabase.from("community_people").select("id,display_name,handle").eq("organization_id", org).is("deleted_at", null).order("display_name") : Promise.resolve({ data: [] }),
  ]);

  if (!recordResult.data) {
    if (query.fout) {
      return <AppShell active={config.label}>
        <header className="page-header">
          <h1>Dossier niet beschikbaar</h1>
        </header>
        <div className="error-note" role="alert">
          De actie kon niet worden afgerond. Het dossier is niet meer beschikbaar of je hebt geen toegang.
        </div>
        <Link href={`/app/${module}`}>Terug naar {config.label}</Link>
      </AppShell>;
    }
    notFound();
  }
  const record = recordResult.data as Row;
  const connectionEntity = module === "campagnes" ? "campaign" : module === "sponsors" ? "partner" : module === "community" ? "community_person" : null;
  const [connections, relationOptions] = connectionEntity ? await Promise.all([
    loadDossierConnections(supabase, org, connectionEntity, id),
    loadRelationOptions(supabase, org, connectionEntity, id),
  ]) : [{ links: [], documents: [], relationships: [] }, []];
  const title = String(record[config.titleColumn]);
  const typeLabel = config.types[String(record[config.typeColumn]) as keyof typeof config.types] ?? String(record[config.typeColumn]);
  const statusLabel = config.statuses[record.status as keyof typeof config.statuses] ?? record.status;
  const externalUrl = String(record[config.urlColumn] ?? "");
  const project = projectsResult.data?.find((item) => item.id === record.project_id);
  const partner = partnersResult.data?.find((item) => item.id === record.partner_id);
  const event = eventsResult.data?.find((item) => item.id === record.event_id);
  const personRoles = (personRolesResult.data ?? []).map((item) => String(item.role));
  const accountOptions = (accountOptionsResult.data ?? []).map((item) => ({ id: item.user_id, label: (item.profiles as { display_name?: string } | null)?.display_name ?? "Naamloos account" }));
  const linkedAccount = accountOptions.find((account) => account.id === record.account_user_id);
  const baseMetadata: MetadataItem[] = [
    { label: "Type", value: typeLabel },
    { label: "Status", value: statusLabel },
    { label: "Aangemaakt", value: formatDateTime(record.created_at) },
    { label: "Laatst aangepast", value: formatDateTime(record.updated_at) },
  ];
  const campaignMetadata: MetadataItem[] = module === "campagnes" ? [
    { label: "Prioriteit", value: ({ low: "Laag", normal: "Normaal", high: "Hoog", urgent: "Urgent" } as Record<string, string>)[String(record.priority)] ?? String(record.priority ?? "Niet bepaald") },
    { label: "Startdatum", value: formatDate(record.start_date as string | null) },
    { label: "Einddatum", value: formatDate(record.end_date as string | null) },
    { label: "Project", value: project ? <Link href={`/app/projecten/${project.id}`}>{project.title}</Link> : "Geen project" },
    { label: "Event", value: event ? <Link href={`/app/events/${event.id}`}>{event.title}</Link> : "Geen event" },
    { label: "Partner", value: partner ? <Link href={`/app/sponsors/${partner.id}`}>{partner.name}</Link> : "Geen partner" },
    { label: "Kanalen", value: Array.isArray(record.channels) && record.channels.length ? record.channels.join(", ") : "Geen kanalen gekozen" },
    { label: "Budget", value: formatCurrency(record.budget as string | number | null) },
    { label: "Waarde", value: formatCurrency(record.value as string | number | null) },
    { label: "Rapportage", value: ({ not_required: "Niet nodig", todo: "Te maken", draft: "In opmaak", sent: "Verstuurd", approved: "Goedgekeurd" } as Record<string, string>)[String(record.reporting_status)] ?? String(record.reporting_status ?? "Niet bepaald") },
    { label: "Impressies", value: record.impressions === null || record.impressions === undefined ? "Niet gemeten" : new Intl.NumberFormat("nl-BE").format(Number(record.impressions)) },
    { label: "Kliks", value: record.clicks === null || record.clicks === undefined ? "Niet gemeten" : new Intl.NumberFormat("nl-BE").format(Number(record.clicks)) },
  ] : [];
  const communityMetadata: MetadataItem[] = module === "community" ? [
    { label: "Rollen", value: personRoles.length ? personRoles.map((role) => communityRoleLabels[role as keyof typeof communityRoleLabels] ?? role).join(", ") : "Geen rollen" },
    { label: "Command Center-account", value: linkedAccount?.label ?? "Niet gekoppeld" },
    { label: "E-mail", value: String(record.email ?? "Niet ingevuld") },
    { label: "Discord", value: String(record.discord_handle ?? "Niet ingevuld") },
    { label: "Taal", value: String(record.language ?? "Niet ingevuld") },
    { label: "Beschikbaarheid", value: String(record.availability ?? "Niet ingevuld") },
  ] : [];

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
          {connectionEntity && <Link href="?nieuw=taak">Taak toevoegen</Link>}
          {module === "sponsors" && <Link href={`/app/rapportage/sponsors/${id}`}>Sponsorrapport</Link>}
          {module === "community" && <Link href={`/app/rapportage/creators/${id}`}>Creatorrapport</Link>}
          {module === "campagnes" && <Link href="?nieuw=content">Content toevoegen</Link>}
          {module === "campagnes" && <Link href="?nieuw=social">Social post toevoegen</Link>}
          {!query.bewerken && <Link className="primary" href="?bewerken=1">Bewerken</Link>}
        </div>
      </header>
      <div className="project-detail-body">
        {query.fout && <div className="error-note">De wijziging kon niet worden opgeslagen ({query.fout}).</div>}
        {query.succes && <div className="success">De wijziging is opgeslagen.</div>}
        {query.bewerken ? (
          <FormModal title={`${title} bewerken`}>
            <OperationalRecordForm action={updateOperationalRecord} module={module} record={record} projects={projectsResult.data ?? []} partners={partnersResult.data ?? []} content={contentResult.data ?? []} campaigns={campaignOptionsResult.data ?? []} events={eventsResult.data ?? []} accountOptions={accountOptions} personRoles={personRoles}/>
          </FormModal>
        ) : (
          <>
            <section className="form-card record-overview"><div className="form-heading"><div><span className="eyebrow">OVERZICHT</span><h2>{config.singular[0].toUpperCase() + config.singular.slice(1)}gegevens</h2></div></div><RecordMetadata items={[...baseMetadata, ...campaignMetadata, ...communityMetadata]}/></section>
            {connectionEntity && <RecordConnectionsPanel entityType={connectionEntity} entityId={id} links={connections.links} documents={connections.documents} relationships={connections.relationships} options={relationOptions} canManage={hasPermission(membership, "manageOrganization")} modal={query.koppeling} selectedLinkId={query.link}/>} 
            {module === "campagnes" && <FinancialSummaryPanel budgets={budgetResult.data ?? []} expenses={expenseResult.data ?? []} income={incomeResult.data ?? []}/>} 
            {module !== "social" && <section className="form-card record-notes"><div className="form-heading"><h2>Notities en briefing</h2></div>{record.notes ? <MarkdownContent>{String(record.notes)}</MarkdownContent> : <p>Nog geen notities toegevoegd.</p>}</section>}
            {module === "campagnes" && <section className="form-card record-notes"><div className="form-heading"><h2>Resultaten en evaluatie</h2></div>{record.results_summary ? <MarkdownContent>{String(record.results_summary)}</MarkdownContent> : <p>Nog geen evaluatie toegevoegd.</p>}</section>}
            {module === "sponsors" && <ApprovalPanel entityType="partner" entityId={id} sourceHref={`/app/sponsors/${id}`} title="Sponsorafspraak goedkeuren"/>}
            {module === "sponsors" && <PartnerSections id={id} contacts={(contactsResult.data ?? []) as unknown as RelatedRow[]} interactions={(interactionsResult.data ?? []) as unknown as RelatedRow[]} campaigns={(partnerCampaignsResult.data ?? []) as unknown as RelatedRow[]} events={[]} content={[]}/>}
            {module === "sponsors" && <SponsorDocumentTools partnerId={id}/>}
            {module === "campagnes" && <CampaignSections id={id} deliverables={(deliverablesResult.data ?? []) as unknown as RelatedRow[]} social={(socialResult.data ?? []) as unknown as RelatedRow[]} content={((contentResult.data ?? []).filter((item) => item.campaign_id === id)) as unknown as RelatedRow[]} people={(communityOptionsResult.data ?? []) as unknown as RelatedRow[]}/>}
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
        {query.nieuw === "taak" && connectionEntity ? <TaskCreateModal returnTo={`/app/${module}/${id}`} projects={projectsResult.data ?? []} people={accountOptions} defaultProjectId={String(record.project_id ?? "") || null} contextEntityType={connectionEntity} contextEntityId={id}/> : null}
        {module === "campagnes" && query.nieuw === "content" ? <FormModal title="Content voor deze campagne"><ContentForm action={createContent} content={{ campaign_id: id, project_id: String(record.project_id ?? "") || null, partner_id: String(record.partner_id ?? "") || null }} projects={projectsResult.data ?? []} campaigns={[{ id, title }]} partners={partnersResult.data ?? []}/></FormModal> : null}
        {module === "campagnes" && query.nieuw === "social" ? <FormModal title="Social post voor deze campagne"><OperationalRecordForm action={createOperationalRecord} module="social" record={{ campaign_id: id, event_id: record.event_id, partner_id: record.partner_id }} content={contentResult.data ?? []} campaigns={[{ id, title }]} events={eventsResult.data ?? []} partners={partnersResult.data ?? []}/></FormModal> : null}
      </div>
    </AppShell>
  );
}
