"use client";
import {useEffect,useRef} from "react";
import {DossierEditor,type DossierEditorProps} from "./dossier-editor";
import "./dossier-editor.css";

/** Creation uses the same draft and single save as the inline dossier editor. */
export function FullDossierCreate(props:Omit<DossierEditorProps,"mode"|"record">){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const node=dialog.current,previous=document.activeElement;
    if(node&&!node.open)node.showModal();
    return()=>{node?.close();if(previous instanceof HTMLElement)previous.focus();};
  },[]);
  return <dialog ref={dialog} className="full-dossier-create" aria-label="Volledig dossier aanmaken" onCancel={event=>event.preventDefault()}><DossierEditor {...props} mode="create"/></dialog>;
}
