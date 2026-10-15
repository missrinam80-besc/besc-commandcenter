"use client";
import {useActionState,useEffect,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import type {SlotActionResult} from "@/app/inschrijven/[page]/actions";
export function SlotActionForm({action,children,label="Opslaan"}:{action:(state:SlotActionResult,fd:FormData)=>Promise<SlotActionResult>;children:ReactNode;label?:string}){
 const [state,submit,pending]=useActionState(action,{ok:false,message:""});const router=useRouter();
 useEffect(()=>{if(state.ok)router.refresh();},[state,router]);
 return <form action={submit} className="slot-owner-form">{children}<button className="row-action" disabled={pending}>{pending?"Verwerken…":label}</button>{state.message&&<p role={state.ok?"status":"alert"}>{state.message}</p>}</form>;
}
