"use server";
import {createHash} from "node:crypto";
import {revalidatePath} from "next/cache";
import {requirePermission} from "@/lib/auth-context";
import {expenseIntakeSchema,expenseProofBucket,expenseProofMaxSize,expenseProofTypes,validExpenseProofHeader,type ExpenseProof} from "@/lib/expense-intake";
export async function submitExpenseIntake(form:FormData):Promise<{ok:boolean;message:string}>{
 const parsed=expenseIntakeSchema.safeParse(Object.fromEntries(form));
 if(!parsed.success)return {ok:false,message:parsed.error.issues.map(issue=>({title:"Vul een omschrijving van 2 tot 180 tekens in.",amount:"Vul een positief bedrag met maximaal twee decimalen in.",expense_date:"Vul een geldige kostdatum in.",claimant_name:"Vul de naam van de indiener in."} as Record<string,string>)[String(issue.path[0])]??"Controleer de ingevulde gegevens en tekstlengtes.").join(" ")};
 const {supabase,membership,user}=await requirePermission("submitExpenses");
 const file=form.get("proof");let proof:ExpenseProof|null=null,bytes:Uint8Array|undefined;
 if(file instanceof File&&file.name&&!file.size)return {ok:false,message:"De gekozen bijlage is leeg. Kies een geldig bewijsstuk."};
 if(file instanceof File&&file.size){
  if(!expenseProofTypes[file.type]||file.size>expenseProofMaxSize)return {ok:false,message:"Kies een PDF, JPG, PNG of WebP van maximaal 5 MB."};
  bytes=new Uint8Array(await file.arrayBuffer());
  if(!validExpenseProofHeader(file.type,bytes))return {ok:false,message:"De bijlage is geen geldig bestand van het gekozen type."};
  proof={path:`${membership.organization_id}/${user.id}/${parsed.data.id}/proof.${expenseProofTypes[file.type]}`,label:file.name.replace(/[\r\n]/g," ").slice(0,180)||"Bewijsstuk",mime:file.type,size:file.size,sha256:createHash("sha256").update(bytes).digest("hex")};
 }
 const {id,...values}=parsed.data;
 try{
  const prepare=await supabase.rpc("prepare_expense_intake",{p_org:membership.organization_id,p_id:id,p_values:{...values,proof}});
  if(prepare.error)return {ok:false,message:prepare.error.code==="40001"?"Deze inzending is al voorbereid met andere gegevens. Kies ‘Nieuwe inzending’ om een afzonderlijke kost in te dienen.":"De inzending kon niet worden voorbereid. Controleer de gegevens, je toegang en de database-inrichting."};
  if(proof&&bytes){
   const upload=await supabase.storage.from(expenseProofBucket).upload(proof.path,bytes,{contentType:proof.mime,upsert:false});
   if(upload.error){
    // An upload may already have succeeded despite a lost response. Reuse only identical bytes.
    const existing=await supabase.storage.from(expenseProofBucket).download(proof.path);
    if(existing.error||!existing.data||createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex")!==proof.sha256)return {ok:false,message:"Het bewijsstuk kon niet worden opgeslagen. Je gegevens blijven staan; probeer opnieuw."};
   }
  }
  const finish=await supabase.rpc("finish_expense_intake",{p_org:membership.organization_id,p_id:id});
  if(finish.error)return {ok:false,message:"De inzending kon niet worden afgerond. Je gegevens blijven staan; opnieuw proberen maakt geen dubbele inboxregistratie."};
  revalidatePath("/app/inbox");revalidatePath("/app");
  return {ok:true,message:"Je kost is ingediend in de CC-inbox. Na controle kan ze worden omgezet naar een kostenitem voor de boekhouding."};
 }catch{return {ok:false,message:"De verbinding werd onderbroken. Je gegevens blijven staan. Probeer dezelfde inzending opnieuw; die wordt niet dubbel geregistreerd."};}
}
