import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {Editor} from "@tiptap/react";
import {richTextExtensions,richTextLink} from "../src/lib/rich-text.ts";
import {newsletterHtml} from "../src/lib/newsletter-html.ts";
const {JSDOM}=createRequire(import.meta.url)("jsdom");
const dom=new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
Object.defineProperty(globalThis,"navigator",{value:dom.window.navigator,configurable:true});
function editor(content:string){return new Editor({extensions:richTextExtensions(),content,contentType:"markdown"});}

test("visuele opmaak bewaart headings, vet, cursief en lijsten bij opnieuw openen",()=>{
 const source="# Titel\n\n**Vet** en *cursief*\n\n- Een\n- Twee\n\n1. Eerste\n2. Tweede\n\n> Citaat\n\n[Bron](https://example.com)";
 const first=editor(source),second=editor(first.getMarkdown());
 assert.deepEqual(second.getJSON(),first.getJSON());
 for(const tag of ["<h1>","<strong>","<em>","<ul>","<ol>","<blockquote>",'<a '])assert.ok(second.getHTML().includes(tag));
 first.destroy();second.destroy();
});
test("bestaande tabellen, code, afbeeldingen en taken blijven behouden",()=>{
 const first=editor("| Naam | Aantal |\n| --- | --- |\n| Kabel | 2 |\n\n- [x] Controle\n\n```js\nconst x=1;\n```\n\n![Logo](https://example.com/logo.png)");
 const second=editor(first.getMarkdown());assert.deepEqual(second.getJSON(),first.getJSON());
 for(const tag of ["<table","<code","<img","taskList"])assert.ok(second.getHTML().includes(tag));
 first.destroy();second.destroy();
});
test("opmaakcommando en undo herstellen de tekst zonder opslagactie",()=>{
 const field=editor("Gewone tekst");field.commands.selectAll();field.commands.toggleBold();assert.equal(field.getMarkdown(),"**Gewone tekst**");
 field.commands.undo();assert.equal(field.getMarkdown(),"Gewone tekst");field.commands.redo();assert.equal(field.getMarkdown(),"**Gewone tekst**");field.destroy();
});
test("onveilige linkprotocollen worden geweigerd",()=>{
 for(const url of ["javascript:alert(1)","data:text/html,foo","file:///etc/passwd"])assert.equal(richTextLink(url),null);
 assert.equal(richTextLink("example.com"),"https://example.com");assert.equal(richTextLink("mailto:test@example.com"),"mailto:test@example.com");
});
test("nieuwsbrieven tonen rijke tekst en voeren ingevoerde HTML of links niet uit",()=>{
 const html=newsletterHtml({title:"TESTFIXTURE",bodyText:"## Titel\n\n**Vet** en *cursief*\n\n[Onveilig](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>"});
 assert.match(html,/<h2[^>]*>Titel/);assert.match(html,/<strong>Vet/);assert.match(html,/<em>cursief/);
 assert.doesNotMatch(html,/href="javascript:|<img src=x/);assert.match(html,/&lt;img/);
});

test("veld openen, blokkeren en een externe reset veranderen de opgeslagen tekst niet",async()=>{
 const React=await import("react"),{createRoot}=await import("react-dom/client");
 const {editorLoader}=await import("./helpers/editor-loader.mts");
 const RichTextField=editorLoader()("src/components/rich-text-field.tsx").RichTextField as React.ComponentType<{value:string;disabled?:boolean;onChange:(v:string)=>void;name:string;label:string}>;
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container),updates:string[]=[];
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const props={name:"description",label:"Beschrijving",onChange:(v:string)=>updates.push(v)};
 await React.act(async()=>{root.render(React.createElement(RichTextField,{...props,value:"Gewone tekst\nzonder opmaak"}));});
 assert.equal(container.querySelector<HTMLInputElement>('input[name="description"]')?.value,"Gewone tekst\nzonder opmaak");assert.deepEqual(updates,[]);
 await React.act(async()=>{root.render(React.createElement(RichTextField,{...props,value:"## Nieuwe tekst",disabled:true}));});
 assert.equal(container.querySelector('.ProseMirror')?.getAttribute('contenteditable'),'false');assert.equal(container.querySelector('h2')?.textContent,"Nieuwe tekst");assert.deepEqual(updates,[]);
 await React.act(async()=>root.unmount());container.remove();
});
