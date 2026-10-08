"use client";
import type {ReactNode, FormEvent} from "react";

export function DossierTabContent({tab,children}:{tab:string;children:ReactNode}) {
  function rememberTab(event:FormEvent<HTMLDivElement>) {
    const form=event.target;
    if (!(form instanceof HTMLFormElement)) return;
    let input=form.querySelector<HTMLInputElement>('input[name="dossier_tab"]');
    if (!input) {input=document.createElement("input");input.type="hidden";input.name="dossier_tab";form.appendChild(input);}
    input.value=tab;
  }
  return <div className="contact-dossier-tab" onSubmitCapture={rememberTab}>{children}</div>;
}
