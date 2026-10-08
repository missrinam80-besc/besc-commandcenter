import type {DossierDraft,DraftRow} from "./dossier-editor-draft";

export function eventPartnerForRow(row:DraftRow,eventId:string):string|null {
 const values=row.values;
 if(values.relationship_type!=="sponsor")return null;
 if(values.source_type==="event"&&values.source_id===eventId&&values.target_type==="partner")return String(values.target_id||"")||null;
 if(values.target_type==="event"&&values.target_id===eventId&&values.source_type==="partner")return String(values.source_id||"")||null;
 return null;
}

export function eventPartnerIds(draft:DossierDraft):string[] {
 const ids=(draft.parts.record_relationships??[]).filter(row=>!row.deleted).map(row=>eventPartnerForRow(row,draft.id)).filter((id):id is string=>Boolean(id));
 if(draft.values.partner_id)ids.unshift(String(draft.values.partner_id));
 return [...new Set(ids)];
}

export function selectEventPartners(draft:DossierDraft,selected:string[],newId:()=>string):DossierDraft {
 const ids=[...new Set(selected)];
 const rows=(draft.parts.record_relationships??[]).map(row=>{
  const partner=eventPartnerForRow(row,draft.id);
  return partner?{...row,deleted:!ids.includes(partner)}:row;
 });
 for(const partner of ids){
  if(rows.some(row=>!row.deleted&&eventPartnerForRow(row,draft.id)===partner))continue;
  const id=newId();
  rows.push({localId:id,id,base:null,deleted:false,values:{source_type:"event",source_id:draft.id,target_type:"partner",target_id:partner,relationship_type:"sponsor"}});
 }
 // Preserve the existing single-link compatibility field without losing extra sponsors.
 const primary=String(draft.values.partner_id??"");
 return {...draft,values:{...draft.values,partner_id:ids.includes(primary)?primary:ids[0]??null},parts:{...draft.parts,record_relationships:rows}};
}
