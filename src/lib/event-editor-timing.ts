import {eventDateFields,eventTimingValues,formatDateTimeLocal} from "./format";

type RecordValues=Record<string,unknown>;
const text=(value:unknown)=>typeof value==="string"?value:"";
export function eventEditorValues(values:RecordValues):RecordValues {
 const result={...values};
 for(const prefix of ["start","end"] as const){
  const fields=eventDateFields(values,prefix);
  result[`${prefix}_date`]=fields.date||null;
  result[`${prefix}_time`]=fields.time;
 }
 return result;
}

// Keep invalid input visible so validation can explain it before any write.
export function eventEditorStorageValues(values:RecordValues):RecordValues {
 const result={...values};
 for(const prefix of ["start","end"] as const){
  if(!(`${prefix}_time` in values))continue;
  const date=text(values[`${prefix}_date`]),time=text(values[`${prefix}_time`]);
  try {
   const timing=eventTimingValues({[`${prefix}_date`]:date,[`${prefix}_time`]:time,[`original_${prefix}_at`]:text(values[`${prefix}_at`])});
   const original=text(values[`${prefix}_at`]);
   result[`${prefix}_at`]=original&&date&&time&&formatDateTimeLocal(original)===`${date}T${time}`?original:timing[`${prefix}_at`];
  }catch{result[`${prefix}_at`]=time?`${date}T${time}`:null;}
 }
 return result;
}

export function eventEditorTimingError(values:RecordValues):string|null {
 try {
  const input:Record<string,string>={};
  for(const prefix of ["start","end"] as const){
   const stamp=text(values[`${prefix}_at`]);
   const local=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp)?stamp:formatDateTimeLocal(stamp);
   const date=text(values[`${prefix}_date`])||local.slice(0,10);
   if(stamp&&(!local||date!==local.slice(0,10)))return "Datum en tijd horen bij dezelfde dag.";
   input[`${prefix}_date`]=date;
   input[`${prefix}_time`]=local.slice(11);
   input[`original_${prefix}_at`]=stamp.includes("Z")||/[+-]\d{2}:\d{2}$/.test(stamp)?stamp:"";
  }
  eventTimingValues(input);
  return null;
 }catch(error){return typeof error==="object"&&error!==null&&"message" in error&&typeof error.message==="string"?error.message:"Controleer de datums en tijden.";}
}
