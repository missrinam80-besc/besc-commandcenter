import {z} from "zod";
import {requireActiveMembership} from "@/lib/auth-context";
import {expenseProofBucket,type ExpenseIntakePayload} from "@/lib/expense-intake";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const p=z.string().uuid().safeParse((await params).id);if(!p.success)return new Response(null,{status:404});
 const{supabase,membership}=await requireActiveMembership();
 const result=await supabase.from("expense_intakes").select("payload,submitted_at").eq("organization_id",membership.organization_id).eq("id",p.data).maybeSingle();
 const proof=(result.data?.payload as ExpenseIntakePayload|undefined)?.proof;
 if(result.error||!result.data?.submitted_at||!proof)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
 const file=await supabase.storage.from(expenseProofBucket).download(proof.path);
 if(file.error||!file.data)return new Response(null,{status:404,headers:{"Cache-Control":"no-store"}});
 return new Response(file.data,{headers:{"Content-Type":proof.mime,"Content-Disposition":`attachment; filename="bewijsstuk"; filename*=UTF-8''${encodeURIComponent(proof.label).replaceAll("'","%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
