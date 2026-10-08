import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const native=createRequire(import.meta.url),cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 const compiled={exports:{}};
 const localRequire=name=>name==='next/navigation'?{useRouter:()=>({push(){},refresh(){}})}:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):name.startsWith('.')?(name.endsWith('.json')?JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),name),'utf8')):load(path.resolve(path.dirname(file),name+'.ts'))):native(name);
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(compiled,compiled.exports,localRequire);
 cache.set(file,compiled.exports);return compiled.exports;
}
const catalog=load('src/lib/dossier-editor-catalog.ts').dossierEditorCatalog;
const Editor=load('src/components/dossier-editor.tsx').DossierEditor;
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const forms=Object.entries(catalog).map(([kind,cfg])=>`<div class="example" data-kind="${kind}" ${kind==='event'?'':'hidden'}>${renderToStaticMarkup(React.createElement(Editor,{kind,id:'11111111-1111-4111-8111-111111111111',mode:'create',cancelHref:'#',permissions:Object.fromEntries(cfg.collections.map(part=>[part.table,true]))}))}</div>`).join('');
const options=Object.entries(catalog).map(([kind,cfg])=>`<option value="${kind}" ${kind==='event'?'selected':''}>${escape(cfg.label)}</option>`).join('');
const css=fs.readFileSync('src/components/dossier-editor.css','utf8');
const html=`<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BESC — dossiereditor: schermvoorbeeld</title><style>
*{box-sizing:border-box}body{--ink:#f0eee8;--muted:#bec8c3;--theme-surface:#1f2924;--line:#4c5b52;--red:#e32635;margin:0;background:#121916;color:var(--ink);font:15px system-ui}body.light{--ink:#17231d;--muted:#52645b;--theme-surface:#fff;--line:#bac7bf;background:#f2f5f3}header{padding:1.2rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;border-bottom:1px solid var(--line)}main{max-width:1200px;margin:2rem auto;padding:1rem;border:1px solid var(--line);border-radius:12px;background:var(--theme-surface)}button,select{color:var(--ink);background:var(--theme-surface);border:1px solid var(--line);border-radius:7px;padding:.6rem .8rem;font:inherit}button:disabled{opacity:.45}p{line-height:1.5}small,.form-help{color:var(--muted)}.event-dossier-tabs{display:flex;gap:.4rem}.form-heading{display:flex;justify-content:space-between;align-items:center}.example[hidden]{display:none}.primary{background:var(--red);color:white}${css}
</style><header><strong>BESC · Volledige dossiereditor</strong><select aria-label="Fichetype" id="kind">${options}</select><button id="theme">Licht/donker</button></header><main><p><strong>Schermvoorbeeld — nog niet aangesloten op de app.</strong> Bekijk de velden en wissel tussen tabbladen en fichetypes. Dit voorbeeld slaat niets op; de knoppen voor toevoegen, verwijderen en opslaan zijn uitgeschakeld. Er zijn geen echte dossiergegevens gebruikt.</p>${forms}</main><script>
document.querySelectorAll('form').forEach(form=>{form.addEventListener('submit',event=>event.preventDefault());form.querySelectorAll('button:not([role="tab"])').forEach(button=>button.disabled=true);form.querySelectorAll('[role="tab"]').forEach(button=>button.addEventListener('click',()=>{form.querySelectorAll('[role="tab"]').forEach(tab=>{tab.setAttribute('aria-selected',String(tab===button));tab.tabIndex=tab===button?0:-1});form.querySelectorAll('[role="tabpanel"]').forEach(panel=>panel.hidden=panel.id!==button.getAttribute('aria-controls'))}))});
document.querySelector('#kind').addEventListener('change',event=>document.querySelectorAll('.example').forEach(example=>example.hidden=example.dataset.kind!==event.target.value));document.querySelector('#theme').addEventListener('click',()=>document.body.classList.toggle('light'));
</script></html>`;
const output=path.resolve(process.argv[2]??'../../outputs/dossiereditor-voorbeeld.html');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,html);process.stdout.write(output+'\n');
