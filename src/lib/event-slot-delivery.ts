export type SlotMessage={id:string;lease_token:string;draft_id:string|null;recipient:string;subject:string;body:string};
export type SlotDeliveryDependencies={claim:()=>Promise<SlotMessage|null>;operation:(op:string,message:SlotMessage,extra?:Record<string,string>)=>Promise<void>;draft:(message:SlotMessage)=>Promise<string>;send:(draftId:string)=>Promise<string>};
/** No retry after an uncertain external send. The durable queue owns leases and retry scheduling. */
export async function deliverSlotEmail(deps:SlotDeliveryDependencies){
 const message=await deps.claim();if(!message)return "empty";
 try{let draftId=message.draft_id;if(!draftId){draftId=await deps.draft(message);await deps.operation("draft",message,{draft_id:draftId});}
 await deps.operation("dispatch",message);const id=await deps.send(draftId);await deps.operation("sent",message,{message_id:id});return "sent";
 }catch{try{await deps.operation("fail",message,{error_code:"mail_delivery_unconfirmed"});}catch{}return "unconfirmed";}
}
