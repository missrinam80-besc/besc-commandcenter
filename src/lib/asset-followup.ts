import {localDateTimeToIso} from "./format.ts";
export const assetAcquisitions={purchased:"Aangekocht",borrowed:"Geleend",gifted:"Gekregen"} as const;
export const assetTypes:Record<string,string>={equipment:"Materiaal",computer:"Computer",streaming:"Streamingmateriaal",furniture:"Meubilair",software:"Software / licentie",vehicle:"Voertuig",other:"Overige"};
export function assetHasPurchaseFields(values:Record<string,unknown>){return values.acquisition_type==="purchased";}
export function assetStorageValues(values:Record<string,unknown>){
 return ["borrowed","gifted"].includes(String(values.acquisition_type))?{...values,acquired_date:null,purchase_value:null,current_value:null}:values;
}
export type AssetUse={id:string;event_id:string;name:string;status:string;pickup_at:string|null;return_at:string|null;events:{title:string;status:string;start_at:string|null;end_at:string|null;start_date:string|null;end_date:string|null}|null};
export type AssetRepair={id:string;title:string;status:string;due_at:string|null};
export type AssetProjectUse={id:string;project_id:string;name:string;status:string;starts_at:string|null;ends_at:string|null;projects:{title:string;start_date:string|null;due_date:string|null}|null};
export type AssetFollowup={uses:AssetUse[];repairs:AssetRepair[];projectUses?:AssetProjectUse[]};
export function openAssetRepairs(rows:AssetRepair[]){return rows.filter(row=>!["done","cancelled","archived"].includes(row.status));}
export function assetUsePeriod(row:AssetUse){return {start:row.pickup_at??row.events?.start_at??row.events?.start_date??null,end:row.return_at??row.events?.end_at??row.events?.end_date??null};}
export function activeAssetUses(rows:AssetUse[],now=Date.now()){
 return rows.filter(row=>{
  if(!row.events||["cancelled","archived"].includes(row.events.status)||["cancelled","returned"].includes(row.status))return false;
  if(row.status==="in_use")return true;
  const {start,end}=assetUsePeriod(row);
  // An incomplete reservation is displayed, never guessed to be current use.
  return Boolean(start&&end&&Date.parse(start)<=now&&now<=Date.parse(end));
 });
}

export type AssetBooking={table:string;id:string;start:string|null;end:string|null};
export type AssetCalendar={id:string;asOf?:string;unavailable:boolean;repair:boolean;bookings:AssetBooking[]};
export function materialPeriod(table:string,values:Record<string,unknown>,root:Record<string,unknown>){
 const isEvent=table==="event_materials";
 const start=String(values[isEvent?"pickup_at":"starts_at"]??root.start_at??root.start_date??"");
 const end=String(values[isEvent?"return_at":"ends_at"]??root.end_at??root[isEvent?"end_date":"due_date"]??"");
 // Whole end dates include that day; timestamp ends are exclusive.
 const startMoment=start.includes("T")?start:start?localDateTimeToIso(start+"T00:00"):null;
 const nextDay=end&&!end.includes("T")?new Date(Date.parse(end)+86400000).toISOString().slice(0,10):null;
 const endMoment=end.includes("T")?end:nextDay?localDateTimeToIso(nextDay+"T00:00"):null;
 return {start:startMoment?Date.parse(startMoment):null,end:endMoment?Date.parse(endMoment):null};
}
export function materialBlocked(calendar:AssetCalendar|undefined,period:{start:number|null;end:number|null},table:string,rowId:string){
 if(!calendar)return null;
 if(calendar.unavailable)return "Buiten dienst";
 if(calendar.repair)return "In herstelling";
 if(calendar.bookings.some(b=>!(b.table===table&&b.id===rowId)&&(period.start===null||period.end===null||!b.start||!b.end||Date.parse(b.start)<period.end&&period.start<Date.parse(b.end))))return "Gereserveerd";
 return null;
}
