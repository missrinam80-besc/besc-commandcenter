"use client";

import {useEffect,useId,useMemo,useRef,useState} from "react";
import {EditorContent,useEditor,useEditorState} from "@tiptap/react";
import {Bold,Italic,List,ListOrdered,Link2,Quote,Redo2,Undo2} from "lucide-react";
import {richTextExtensions,richTextLink} from "@/lib/rich-text";

type RichTextFieldProps={id?:string;name?:string;label?:string;value:string;onChange:(value:string)=>void;disabled?:boolean;required?:boolean;rows?:number;placeholder?:string};

export function RichTextField({id:providedId,name,label,value,onChange,disabled=false,required=false,rows=4,placeholder}:RichTextFieldProps){
 const generated=useId(),id=providedId??`rich-text-${generated}`,lastValue=useRef(value);
 const extensions=useMemo(()=>richTextExtensions(),[]);
 const [linkOpen,setLinkOpen]=useState(false),[href,setHref]=useState(""),[linkError,setLinkError]=useState("");
 const editor=useEditor({
  extensions,content:value,contentType:"markdown",immediatelyRender:false,
  editable:!disabled,
  editorProps:{attributes:{id,role:"textbox","aria-multiline":"true","aria-label":label??placeholder??"Tekst","aria-required":String(required),class:"rich-text-document"}},
  onUpdate:({editor,transaction})=>{if(!transaction.docChanged)return;const markdown=editor.isEmpty?"":editor.getMarkdown();lastValue.current=markdown;onChange(markdown);},
 });
 const state=useEditorState({editor,selector:({editor})=>({bold:editor?.isActive("bold")??false,italic:editor?.isActive("italic")??false,bullet:editor?.isActive("bulletList")??false,ordered:editor?.isActive("orderedList")??false,quote:editor?.isActive("blockquote")??false,link:editor?.isActive("link")??false,heading:editor?.isActive("heading",{level:1})?"1":editor?.isActive("heading",{level:2})?"2":editor?.isActive("heading",{level:3})?"3":"0",undo:editor?.can().undo()??false,redo:editor?.can().redo()??false})});
 useEffect(()=>{editor?.setEditable(!disabled,false);},[editor,disabled]);
 useEffect(()=>{if(editor&&value!==lastValue.current){lastValue.current=value;editor.commands.setContent(value,{contentType:"markdown",emitUpdate:false});}},[editor,value]);
 const locked=disabled||!editor;
 function applyLink(){const target=richTextLink(href);if(!target){setLinkError("Vul een geldige website- of e-maillink in.");return;}editor?.chain().focus().extendMarkRange("link").setLink({href:target}).run();setLinkOpen(false);}
 return <div className="rich-text-field" data-disabled={disabled||undefined}>
  {label&&<label htmlFor={id}>{label}</label>}
  <div className="rich-text-toolbar" role="group" aria-label={`Tekstopmaak${label?`: ${label}`:""}`}>
   <select aria-label="Tekststijl" disabled={locked} value={state?.heading??"0"} onChange={event=>{const level=Number(event.target.value);if(level)editor?.chain().focus().setHeading({level:level as 1|2|3}).run();else editor?.chain().focus().setParagraph().run();}}><option value="0">Normale tekst</option><option value="1">Titel</option><option value="2">Tussentitel</option><option value="3">Kleine titel</option></select>
   <button type="button" title="Vet" aria-label="Vet" aria-pressed={state?.bold??false} disabled={locked} onClick={()=>editor?.chain().focus().toggleBold().run()}><Bold size={15}/></button>
   <button type="button" title="Cursief" aria-label="Cursief" aria-pressed={state?.italic??false} disabled={locked} onClick={()=>editor?.chain().focus().toggleItalic().run()}><Italic size={15}/></button>
   <button type="button" title="Opsomming" aria-label="Opsomming" aria-pressed={state?.bullet??false} disabled={locked} onClick={()=>editor?.chain().focus().toggleBulletList().run()}><List size={15}/></button>
   <button type="button" title="Genummerde lijst" aria-label="Genummerde lijst" aria-pressed={state?.ordered??false} disabled={locked} onClick={()=>editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15}/></button>
   <button type="button" title="Citaat" aria-label="Citaat" aria-pressed={state?.quote??false} disabled={locked} onClick={()=>editor?.chain().focus().toggleBlockquote().run()}><Quote size={15}/></button>
   <button type="button" title="Link" aria-label="Link" aria-pressed={state?.link??false} disabled={locked} onClick={()=>{setHref(String(editor?.getAttributes("link").href??""));setLinkError("");setLinkOpen(current=>!current);}}><Link2 size={15}/></button>
   <button type="button" title="Ongedaan maken" aria-label="Ongedaan maken" disabled={locked||!state?.undo} onClick={()=>editor?.chain().focus().undo().run()}><Undo2 size={15}/></button>
   <button type="button" title="Opnieuw" aria-label="Opnieuw" disabled={locked||!state?.redo} onClick={()=>editor?.chain().focus().redo().run()}><Redo2 size={15}/></button>
  </div>
  {linkOpen&&<div className="rich-text-link-panel"><label>Linkadres<input type="url" value={href} disabled={disabled} placeholder="https://…" onChange={event=>setHref(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();applyLink();}if(event.key==="Escape"){event.preventDefault();setLinkOpen(false);editor?.commands.focus();}}}/></label><button type="button" disabled={disabled} onClick={applyLink}>Toepassen</button><button type="button" disabled={disabled} onClick={()=>{editor?.chain().focus().extendMarkRange("link").unsetLink().run();setLinkOpen(false);}}>Link verwijderen</button><button type="button" onClick={()=>{setLinkOpen(false);editor?.commands.focus();}}>Sluiten</button>{linkError&&<p role="alert">{linkError}</p>}</div>}
  {editor?<EditorContent editor={editor}/>:<textarea id={id} aria-label={label??placeholder??"Tekst"} disabled={disabled} required={required} rows={rows} placeholder={placeholder} value={value} onChange={event=>{lastValue.current=event.target.value;onChange(event.target.value);}}/>}
  {name&&<input type="hidden" name={name} disabled={disabled} value={value}/>}
 </div>;
}
