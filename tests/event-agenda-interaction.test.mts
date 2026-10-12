import assert from "node:assert/strict";
import test from "node:test";
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {createRequire} from "node:module";
import {editorLoader} from "./helpers/editor-loader.mts";
const {JSDOM}=createRequire(import.meta.url)("jsdom");
test("agenda schakelt naar lijst, toont activiteit en nachteinde en behoudt onbekende tijden",async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/"});
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const load=editorLoader({"next/link":{__esModule:true,default:({children,...props}:React.PropsWithChildren)=>React.createElement("a",props,children)}});
 const Component=load("src/components/event-timegrid.tsx").EventTimeGrid as React.ComponentType<Record<string,unknown>>;
 const rows=[{id:"timed",title:"TESTFIXTURE nachtprogramma",kind:"program",status:"confirmed",starts_at:"2026-10-08T21:00Z",ends_at:"2026-10-09T01:00Z",person_id:null,location:"TESTFIXTURE zaal",notes:null,activity_id:"activity"},{id:"unknown",title:"TESTFIXTURE zonder tijd",kind:"stream",status:"draft",starts_at:null,ends_at:null,person_id:null,location:null,notes:null}];
 const node=dom.window.document.getElementById("root"),root=createRoot(node);
 try{
 await act(async()=>root.render(React.createElement(Component,{rows,people:[],canEdit:true,activities:[{id:"activity",title:"TESTFIXTURE workshop"}],eventPeriod:{start_date:"2026-10-08",end_date:"2026-10-09"}})));
 assert.equal(node.querySelectorAll("section.event-timegrid-day").length,2);
 assert.equal(node.querySelector('button[aria-label="Vorige week"]').disabled,true);
 await act(async()=>[...node.querySelectorAll("button")].find(b=>b.textContent==="Lijst").click());
 assert.equal(node.querySelectorAll("section.event-timegrid-day").length,0);
 assert.equal(node.querySelectorAll(".event-agenda-list button").length,2);
 assert.match(node.textContent,/TESTFIXTURE workshop/);assert.match(node.textContent,/9 okt 2026/);assert.match(node.textContent,/TESTFIXTURE zonder tijd/);
 await act(async()=>node.querySelector(".event-agenda-list button").click());
 assert.equal(node.querySelector('.event-timegrid-details a[href="?tab=activiteiten#activiteit-activity"]').textContent,"TESTFIXTURE workshop");
 assert.equal([...node.querySelectorAll('.event-timegrid-details a')].find(a=>a.getAttribute('href')==='?tab=planning&schema=timed')?.textContent,"Bewerken");
 await act(async()=>[...node.querySelectorAll("button")].find(b=>b.textContent==="Dag").click());
 assert.equal(node.querySelectorAll("section.event-timegrid-day").length,1);
 await act(async()=>node.querySelector('button[aria-label="Volgende dag"]').click());
 assert.equal(node.querySelector('input[type="date"]').value,"2026-10-09");
 assert.equal(node.querySelector('button[aria-label="Volgende dag"]').disabled,true);
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,{window:oldWindow,document:oldDocument,IS_REACT_ACT_ENVIRONMENT:false});}
});
