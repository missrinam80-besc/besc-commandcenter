"use server";

import { kpiValueLabel } from "@/lib/management-report";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import {
  getGoogleDriveDocumentMetadata,
  createDocumentFromGoogleTemplate,
  createPresentationFromGoogleTemplate,
} from "@/lib/google-workspace";

import { resolveDossierDriveFolder } from "@/lib/dossier-drive-folder";

import { formatEventEndpoint } from "@/lib/format";

import { sourceObservation } from "@/lib/source-observation";

type Context = Awaited<ReturnType<typeof requirePermission>>;
type GeneratedDocument = Awaited<ReturnType<typeof createDocumentFromGoogleTemplate>>;

function displayDate(value: string | null | undefined, withTime = false) {
  if (!value) return "Niet ingevuld";
  return new Intl.DateTimeFormat("nl-BE", withTime
    ? { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }
    : { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date(value));
}

async function saveDocumentMetadata(input: {
  context: Context;
  entityType: "meeting" | "partner" | "event";
  entityId: string;
  document: GeneratedDocument;
}) {
  const { context, entityType, entityId, document } = input;
  const observed = await getGoogleDriveDocumentMetadata(document.id);
  const { error } = await context.supabase.from("google_resource_links").insert({
    organization_id: context.membership.organization_id,
    entity_type: entityType,
    entity_id: entityId,
    resource_type: "document",
    google_id: document.id,
    name: document.name,
    mime_type: document.mimeType,
    web_url: document.webViewLink,
    drive_id: document.driveId,
    parent_id: document.parents[0] ?? null,
    ...sourceObservation(observed),
    created_by: context.user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function generateMeetingMinutes(formData: FormData) {
  const parsed = z.object({ meeting_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/vergaderingen?fout=document");
  const path = `/app/vergaderingen/${parsed.data.meeting_id}`;
  const context = await requirePermission("manageOrganization", `${path}?fout=rechten`);
  const [{ data: meeting }, { data: actions }] = await Promise.all([
    context.supabase.from("meetings").select("*").eq("organization_id", context.membership.organization_id).eq("id", parsed.data.meeting_id).is("deleted_at", null).maybeSingle(),
    context.supabase.from("meeting_action_items").select("title,assignee_text,status").eq("organization_id", context.membership.organization_id).eq("meeting_id", parsed.data.meeting_id).order("created_at"),
  ]);
  if (!meeting) redirect(`${path}?fout=document`);
  try {
    const folder = await resolveDossierDriveFolder({ supabase: context.supabase, organizationId: context.membership.organization_id, userId: context.user.id, entityType: "meeting", entityId: meeting.id, module: "meetings", title: meeting.title });
    const document = await createDocumentFromGoogleTemplate({
      template: "minutes",
      name: `Notulen - ${meeting.title}`,
      parentId: folder.id,
      replacements: {
        TITEL: meeting.title,
        DATUM: displayDate(meeting.meeting_at, true),
        TYPE: meeting.meeting_type,
        DEELNEMERS: (meeting.attendees ?? []).join(", "),
        NOTITIES: meeting.notes,
        BESLUITEN: meeting.decisions,
        ACTIEPUNTEN: (actions ?? []).map((item, index) => `${index + 1}. ${item.title}${item.assignee_text ? ` — ${item.assignee_text}` : ""} (${item.status})`).join("\n"),
      },
    });
    await saveDocumentMetadata({ context, entityType: "meeting", entityId: meeting.id, document });
    await context.supabase.from("meetings").update({ minutes_url: document.webViewLink, updated_at: new Date().toISOString() }).eq("organization_id", context.membership.organization_id).eq("id", meeting.id);
  } catch {
    redirect(`${path}?fout=document-genereren`);
  }
  revalidatePath(path);
  redirect(`${path}?succes=document`);
}

export async function generateSponsorReport(formData: FormData) {
  const parsed = z.object({ partner_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/sponsors?fout=document");
  const path = `/app/sponsors/${parsed.data.partner_id}`;
  const context = await requirePermission("manageOrganization", `${path}?fout=rechten`);
  const [{ data: partner }, { data: campaigns }] = await Promise.all([
    context.supabase.from("partners").select("*").eq("organization_id", context.membership.organization_id).eq("id", parsed.data.partner_id).is("deleted_at", null).maybeSingle(),
    context.supabase.from("campaigns").select("title,status,start_date,end_date,value,deliverables").eq("organization_id", context.membership.organization_id).eq("partner_id", parsed.data.partner_id).is("deleted_at", null).order("start_date"),
  ]);
  if (!partner) redirect(`${path}?fout=document`);
  try {
    const folder = await resolveDossierDriveFolder({ supabase: context.supabase, organizationId: context.membership.organization_id, userId: context.user.id, entityType: "partner", entityId: partner.id, module: "sponsors", title: partner.name });
    const document = await createDocumentFromGoogleTemplate({
      template: "sponsorReport",
      name: `Sponsorrapport - ${partner.name}`,
      parentId: folder.id,
      replacements: {
        SPONSOR: partner.name,
        DATUM: displayDate(new Date().toISOString()),
        TYPE: partner.partner_type,
        STATUS: partner.status,
        CONTACTPERSOON: partner.contact_name,
        EMAIL: partner.email,
        WEBSITE: partner.website,
        SAMENWERKING: partner.collaboration_type,
        GESCHATTE_WAARDE: partner.estimated_value == null ? null : `€ ${Number(partner.estimated_value).toFixed(2)}`,
        NOTITIES: partner.notes,
        CAMPAGNES: (campaigns ?? []).map((item) => `${item.title} — ${item.status}${item.value == null ? "" : ` — € ${Number(item.value).toFixed(2)}`}`).join("\n"),
      },
    });
    await saveDocumentMetadata({ context, entityType: "partner", entityId: partner.id, document });
  } catch {
    redirect(`${path}?fout=document-genereren`);
  }
  revalidatePath(path);
  redirect(`${path}?succes=document`);
}

export async function generateEventDossier(formData: FormData) {
  const parsed = z.object({ event_id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/events?fout=document");
  const path = `/app/events/${parsed.data.event_id}`;
  const context = await requirePermission("manageEvents", `${path}?fout=rechten`);
  const { data: event } = await context.supabase.from("events").select("*").eq("organization_id", context.membership.organization_id).eq("id", parsed.data.event_id).is("deleted_at", null).maybeSingle();
  if (!event) redirect(`${path}?fout=document`);
  try {
    const eventFolder = await resolveDossierDriveFolder({ supabase: context.supabase, organizationId: context.membership.organization_id, userId: context.user.id, entityType: "event", entityId: event.id, module: "events", title: event.title, legacyDriveUrl: event.drive_url });
    const document = await createDocumentFromGoogleTemplate({
      template: "event",
      name: `Eventdossier - ${event.title}`,
      parentId: eventFolder.id,
      replacements: {
        EVENT: event.title,
        DATUM: displayDate(new Date().toISOString()),
        TYPE: event.event_type,
        STATUS: event.status,
        START: formatEventEndpoint(event, "start"),
        EINDE: formatEventEndpoint(event, "end"),
        LOCATIE: event.is_online ? "Online" : event.location,
        ROL_BESC: event.role_besc,
        BESCHRIJVING: event.description,
        VERWACHTE_DEELNEMERS: event.expected_attendees,
      },
    });
    await saveDocumentMetadata({ context, entityType: "event", entityId: event.id, document });
  } catch {
    redirect(`${path}?fout=document-genereren`);
  }
  revalidatePath(path);
  redirect(`${path}?succes=document`);
}

export async function generateSponsorPitchdeck(formData:FormData){const parsed=z.object({partner_id:z.string().uuid(),period_start:z.string().date(),period_end:z.string().date(),period_label:z.string().trim().min(2).max(100)}).safeParse(Object.fromEntries(formData));if(!parsed.success)redirect("/app/rapportage?fout=pitchdeck-velden");const path=`/app/rapportage/sponsors/${parsed.data.partner_id}`;const context=await requirePermission("manageOrganization",`${path}?fout=rechten`);const[partnerResult,campaignResult,kpiResult]=await Promise.all([context.supabase.from("partners").select("id,name,collaboration_type,estimated_value").eq("organization_id",context.membership.organization_id).eq("id",parsed.data.partner_id).is("deleted_at",null).maybeSingle(),context.supabase.from("campaigns").select("title,status,start_date,end_date,value,impressions,clicks").eq("organization_id",context.membership.organization_id).eq("partner_id",parsed.data.partner_id).is("deleted_at",null),context.supabase.from("kpi_records").select("metric,value,measurement_status,unit,source").eq("organization_id",context.membership.organization_id).eq("partner_id",parsed.data.partner_id).is("deleted_at",null).gte("period_end",parsed.data.period_start).lt("period_end",parsed.data.period_end)]);const partner=partnerResult.data;if(!partner)redirect(`${path}?fout=pitchdeck`);const campaigns=(campaignResult.data??[]).filter(item=>(!item.start_date||item.start_date<parsed.data.period_end)&&(!item.end_date||item.end_date>=parsed.data.period_start));try{const folder=await resolveDossierDriveFolder({supabase:context.supabase,organizationId:context.membership.organization_id,userId:context.user.id,entityType:"partner",entityId:partner.id,module:"sponsors",title:partner.name});const presentation=await createPresentationFromGoogleTemplate({template:"sponsor",name:`Pitchdeck - ${partner.name} - ${parsed.data.period_label}`,parentId:folder.id,replacements:{SPONSOR:partner.name,PERIODE:parsed.data.period_label,SAMENWERKING:partner.collaboration_type,GESCHATTE_WAARDE:partner.estimated_value==null?null:`€ ${Number(partner.estimated_value).toFixed(2)}`,CAMPAGNES:campaigns.map(x=>`${x.title} — ${x.status}`).join("\n"),GEREALISEERDE_WAARDE:`€ ${campaigns.reduce((sum,x)=>sum+Number(x.value??0),0).toFixed(2)}`,IMPRESSIES:campaigns.reduce((sum,x)=>sum+Number(x.impressions??0),0),KLIKS:campaigns.reduce((sum,x)=>sum+Number(x.clicks??0),0),KPI_RESULTATEN:(kpiResult.data??[]).map(x=>`${x.metric}: ${kpiValueLabel(x)} ${x.unit} (${x.source})`).join("\n")}});await saveDocumentMetadata({context,entityType:"partner",entityId:partner.id,document:presentation})}catch{redirect(`${path}?fout=pitchdeck-genereren`)}revalidatePath(path);redirect(`${path}?succes=pitchdeck`)}

