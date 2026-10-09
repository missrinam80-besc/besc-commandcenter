"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-context";
import {assetBulkSchema,type AssetBulkInput} from "@/lib/asset-bulk";

const MATERIALS_PATH = "/app/materialen";
export async function bulkAssetAction(input:AssetBulkInput){
 const parsed=assetBulkSchema.safeParse(input);
 if(!parsed.success)return {ok:false,message:"Selecteer items en controleer de gekozen velden. Een locatie mag maximaal 300 tekens bevatten."};
 const {supabase,membership}=await requirePermission("manageOrganization",`${MATERIALS_PATH}?fout=geen-toegang`);
 const values=parsed.data;
 const {data,error}=await supabase.rpc("bulk_asset_action",{p_organization_id:membership.organization_id,p_ids:values.ids,p_mode:values.mode,p_change_location:values.changeLocation,p_location:values.location||null,p_change_status:values.changeStatus,p_status:values.status??null});
 if(error)return {ok:false,message:error.message==="asset_selection_unavailable"?"Een geselecteerd item is niet meer beschikbaar of je hebt er geen toegang toe. Er is niets gewijzigd. Vernieuw de lijst en selecteer opnieuw.":error.code==="42501"?"Je hebt geen bevoegdheid om deze materialen te wijzigen. Er is niets gewijzigd.":error.message==="asset_bulk_fields"?"Controleer de locatie en status. Er is niets gewijzigd.":"De bulkactie kon niet worden bevestigd. Vernieuw de lijst voordat je opnieuw probeert."};
 if(data!==values.ids.length)return {ok:false,message:"De bulkactie kon niet volledig worden bevestigd. Vernieuw de lijst voordat je opnieuw probeert."};
 revalidatePath(MATERIALS_PATH);
 revalidatePath("/app/events","layout");revalidatePath("/app/projecten","layout");revalidatePath("/app/campagnes","layout");
 const operation=values.mode==="archive"?"gearchiveerd":values.mode==="delete"?"verwijderd":"bijgewerkt";
 return {ok:true,message:`${data} ${data===1?"item":"items"} ${operation}.`};
}
const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalMoney = z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().min(0).optional());
const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().max(180).optional(),
  asset_type: z.enum(["equipment", "computer", "streaming", "furniture", "software", "vehicle", "other"]),
  status: z.enum(["planned", "active", "maintenance", "loaned", "retired", "lost", "archived"]),
  serial_number: z.string().trim().max(180).optional(),
  owner_person_id: optionalUuid,
  location: z.string().trim().max(300).optional(),
  acquired_date: z.string().optional(),
  purchase_value: optionalMoney,
  current_value: optionalMoney,
  supplier_id: optionalUuid,
  project_id: optionalUuid,
  event_id: optionalUuid,
  campaign_id: optionalUuid,
  document_url: z.string().url().optional().or(z.literal("")),
  notes: z.string().trim().max(10000).optional(),
});

export async function saveAsset(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${MATERIALS_PATH}?fout=velden`);
  const { supabase, user, membership } = await requirePermission("manageOrganization", `${MATERIALS_PATH}?fout=geen-toegang`);
  const { id, ...data } = parsed.data;
  const values = {
    ...data,
    name: data.name || "Naamloos materiaal",
    serial_number: data.serial_number || null,
    owner_person_id: data.owner_person_id || null,
    location: data.location || null,
    acquired_date: data.acquired_date || null,
    purchase_value: data.purchase_value ?? null,
    current_value: data.current_value ?? null,
    supplier_id: data.supplier_id || null,
    project_id: data.project_id || null,
    event_id: data.event_id || null,
    campaign_id: data.campaign_id || null,
    document_url: data.document_url || null,
    notes: data.notes || null,
    updated_at: new Date().toISOString(),
  };
  const result = id
    ? await supabase.from("assets").update(values).eq("organization_id", membership.organization_id).eq("id", id).is("deleted_at", null)
    : await supabase.from("assets").insert({ ...values, organization_id: membership.organization_id, created_by: user.id });
  if (result.error) redirect(`${MATERIALS_PATH}?fout=opslaan`);
  revalidatePath(MATERIALS_PATH);
  redirect(`${MATERIALS_PATH}?succes=opgeslagen`);
}

export async function removeAsset(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), mode: z.enum(["archive", "delete"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${MATERIALS_PATH}?fout=verwijderen`);
  const { supabase, membership } = await requirePermission("manageOrganization", `${MATERIALS_PATH}?fout=geen-toegang`);
  const values = parsed.data.mode === "archive"
    ? { status: "archived", updated_at: new Date().toISOString() }
    : { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from("assets").update(values).eq("organization_id", membership.organization_id).eq("id", parsed.data.id).is("deleted_at", null);
  if (error) redirect(`${MATERIALS_PATH}?fout=verwijderen`);
  revalidatePath(MATERIALS_PATH);
  redirect(`${MATERIALS_PATH}?succes=verwijderd`);
}
