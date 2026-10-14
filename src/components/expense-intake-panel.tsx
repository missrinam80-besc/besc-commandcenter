import Link from "next/link";
import {requireActiveMembership} from "@/lib/auth-context";
import {hasPermission} from "@/lib/permissions";
import type {ExpenseIntakePayload} from "@/lib/expense-intake";
import {convertInboxItem} from "@/app/app/inbox/[id]/actions";
export type ExpenseIntakeRecord={id:string;payload:ExpenseIntakePayload;expense_id:string|null;submitted_at:string|null};
export async function loadExpenseIntake(field:"id"|"expense_id",id:string){const{supabase,membership}=await requireActiveMembership();return supabase.from("expense_intakes").select("id,payload,expense_id,submitted_at").eq("organization_id",membership.organization_id).eq(field,id).maybeSingle();}
export async function ExpenseIntakePanel({inboxId,record}:{inboxId?:string;record?:ExpenseIntakeRecord}){
 const{membership}=await requireActiveMembership();const result=record?{data:record,error:null}:inboxId?await loadExpenseIntake("id",inboxId):null;
 if(result?.error)return <section className="form-card"><p className="error-note">De kostgegevens en het bewijsstuk konden niet worden geladen. Omzetten is tijdelijk niet beschikbaar.</p></section>;
 const row=result?.data as ExpenseIntakeRecord|null;if(!row)return null;const p=row.payload;
 return <section className="form-card expense-intake-details"><div className="form-heading"><h2>{inboxId?"Ingediende kost":"Ingezonden bewijsstuk"}</h2></div><dl><div><dt>Bedrag</dt><dd>€ {Number(p.amount).toFixed(2)}</dd></div><div><dt>Datum van de kost</dt><dd>{p.expense_date}</dd></div><div><dt>Indiener / begunstigde</dt><dd>{p.claimant_name}</dd></div><div><dt>Leverancier</dt><dd>{p.supplier||"—"}</dd></div><div><dt>Factuur- of bonnummer</dt><dd>{p.invoice_number||"—"}</dd></div><div><dt>Bijlage</dt><dd>{p.proof?<a href={`/api/expense-proof/${row.id}`} target="_blank" rel="noreferrer">{p.proof.label}</a>:"Geen bijlage meegestuurd"}</dd></div></dl>{inboxId&&<div className="form-actions">{row.expense_id?<Link className="row-action" href={`/app/financien/kosten/${row.expense_id}`}>Kostenitem openen</Link>:hasPermission(membership,"manageInbox")&&hasPermission(membership,"manageFinance")?<form action={convertInboxItem}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="target" value="expense"/><button className="primary" type="submit">Omzetten naar kostenitem</button></form>:<p className="form-help">Omzetten vraagt bevoegdheid voor zowel inboxbeheer als financiële administratie.</p>}</div>}</section>;
}
