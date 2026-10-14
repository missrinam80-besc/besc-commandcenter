"use client";
import {useRouter} from "next/navigation";
import {useActionState,useEffect,useRef} from "react";
import {startSlotRequest,verifySlotRequest} from "@/app/inschrijven/[page]/actions";
export function SlotPublicForm({page,slotId,requestId,canDiscord=false}:{page:string;slotId:string;requestId:string;canDiscord?:boolean}){
 const [state,action,pending]=useActionState(startSlotRequest,{ok:false,message:""});
 return <form action={action} className="slot-public-form"><input type="hidden" name="page" value={page}/><input type="hidden" name="slot_id" value={slotId}/><input type="hidden" name="id" value={requestId}/>
 <div className="slot-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
 <label>Naam<input name="name" required minLength={2} maxLength={180} autoComplete="name"/></label><label>E-mailadres<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
 <label>Berichten ontvangen via<select name="channel" defaultValue="email"><option value="email">E-mail</option>{canDiscord&&<option value="discord">Discord-DM (gekoppeld account)</option>}</select></label>
 <p className="form-help">Je ontvangt eerst een e-mail om je adres te bevestigen. Daarna wacht je aanvraag op goedkeuring door de eventeigenaar.</p><button className="primary" disabled={pending||state.ok}>{pending?"Aanvragen…":"Plek aanvragen"}</button>{state.message&&<p role={state.ok?"status":"alert"}>{state.message}</p>}</form>;
}
export function SlotVerificationForm({page,requestId}:{page:string;requestId:string}){
 const token=useRef("");const router=useRouter();const [state,action,pending]=useActionState(verifySlotRequest,{ok:false,message:""});
 useEffect(()=>{if(state.ok)router.refresh();},[state,router]);
 useEffect(()=>{const code=new URLSearchParams(window.location.hash.slice(1)).get("code")??"";token.current=code;if(code)window.history.replaceState(null,"",window.location.pathname+window.location.search);},[]);
 return <section className="slot-public-card"><h2>Bevestig je e-mailadres</h2><p>Klik hieronder om je aanvraag te bevestigen. De beschikbaarheid wordt op dat moment gecontroleerd.</p><form action={fd=>{fd.set("token",token.current);action(fd);}}><input type="hidden" name="page" value={page}/><input type="hidden" name="id" value={requestId}/><button className="primary" disabled={pending||state.ok}>{pending?"Bevestigen…":"E-mailadres en aanvraag bevestigen"}</button>{state.message&&<p role={state.ok?"status":"alert"}>{state.message}</p>}<p className="form-help">Werkt de bevestiging niet? Open dan de volledige link uit je e-mail opnieuw.</p></form></section>;
}
