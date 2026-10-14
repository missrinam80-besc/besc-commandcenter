import {z} from "zod";
export const expenseProofBucket="expense-proofs";
export const expenseProofMaxSize=5*1024*1024;
export const expenseProofTypes:Record<string,string>={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
export const expenseIntakeSchema=z.object({id:z.string().uuid(),title:z.string().trim().min(2).max(180),amount:z.coerce.number().positive().max(9999999999.99).refine(value=>Math.abs(value*100-Math.round(value*100))<0.0001,"Gebruik maximaal twee decimalen."),expense_date:z.iso.date(),supplier:z.string().trim().max(180),invoice_number:z.string().trim().max(180),claimant_name:z.string().trim().min(1).max(180),notes:z.string().max(5000),event_id:z.string().uuid().or(z.literal(""))});
export function validExpenseProofHeader(mime:string,bytes:Uint8Array){
 if(mime==="application/pdf")return new TextDecoder().decode(bytes.slice(0,5))==="%PDF-";
 if(mime==="image/jpeg")return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/png")return [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
 if(mime==="image/webp")return new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
 return false;
}
export type ExpenseProof={path:string;label:string;mime:string;size:number;sha256:string};
export type ExpenseIntakePayload={title:string;amount:number;expense_date:string;supplier:string;invoice_number:string;claimant_name:string;notes:string;event_id:string;proof:ExpenseProof|null};
