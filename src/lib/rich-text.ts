import StarterKit from "@tiptap/starter-kit";
import {Markdown} from "@tiptap/markdown";
import {TableKit} from "@tiptap/extension-table";
import {TaskItem,TaskList} from "@tiptap/extension-list";
import Image from "@tiptap/extension-image";

export function richTextExtensions(){
 return [StarterKit.configure({underline:false,link:{openOnClick:false,defaultProtocol:"https"}}),TableKit,TaskList,TaskItem.configure({nested:true}),Image.configure({allowBase64:false}),Markdown];
}

export function richTextLink(value:string):string|null{
 const text=value.trim();if(!text||/[\\\u0000-\u001f]/.test(text))return null;
 if(text.startsWith("/")&&!text.startsWith("//"))return text;
 const href=/^[a-z][\w+.-]*:/i.test(text)?text:`https://${text}`;
 try{const url=new URL(href);return ["https:","http:","mailto:"].includes(url.protocol)?href:null;}catch{return null;}
}

export function isRichTextField(name:string){
 return /^(notes|description|goal|deliverables|acceptance_criteria|closure_evaluation|body|body_text|copy|summary|agreement_summary|results_summary|decisions|action_points)$/.test(name);
}
