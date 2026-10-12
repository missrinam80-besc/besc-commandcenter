import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const native=createRequire(import.meta.url),cache=new Map();
function load(file){
 file=path.resolve(file);if(!fs.existsSync(file)&&file.endsWith(".ts"))file=file.slice(0,-3)+".tsx";if(cache.has(file))return cache.get(file);
 const compiled={exports:{}};
 const localRequire=name=>name==='next/link'?{default:({children,...props})=>React.createElement('a',props,children)}:name==='./asset-planning'?load('src/components/asset-planning.tsx'):name==='next/navigation'?{useRouter:()=>({push(){},refresh(){}})}:name.startsWith('@/')?load('src/'+name.slice(2)+'.ts'):name.startsWith('.')?(name.endsWith('.json')?JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),name),'utf8')):load(path.resolve(path.dirname(file),name.endsWith('.ts')?name:name+'.ts'))):native(name);
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(compiled,compiled.exports,localRequire);
 cache.set(file,compiled.exports);return compiled.exports;
}
const catalog=load('src/lib/dossier-editor-catalog.ts').dossierEditorCatalog;
const Editor=load('src/components/dossier-editor.tsx').DossierEditor;
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const forms=Object.entries(catalog).map(([kind,cfg])=>`<div class="example" data-kind="${kind}" ${kind==='event'?'':'hidden'}>${renderToStaticMarkup(React.createElement(Editor,{kind,id:'11111111-1111-4111-8111-111111111111',mode:'create',initialValues:kind==='asset'?{acquisition_type:'purchased'}:{},cancelHref:'#',permissions:Object.fromEntries(cfg.collections.map(part=>[part.table,true]))}))}</div>`).join('');
const options=Object.entries(catalog).map(([kind,cfg])=>`<option value="${kind}" ${kind==='event'?'selected':''}>${escape(cfg.label)}</option>`).join('');
const css=fs.readFileSync('src/components/dossier-editor.css','utf8');
// Use the app stylesheet, so the preview cannot hide missing shared styles.
const appCss=fs.readFileSync('src/app/globals.css','utf8').replace(/@import\s+"\.\/([^";]+)";/g,(_,file)=>fs.readFileSync(path.join('src/app',file),'utf8'));
const html=`<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BESC — dossiereditor: schermvoorbeeld</title><style>
${appCss}${css}
*{box-sizing:border-box}body{margin:0;background:#141716;font:14px system-ui}body.light{background:#f6f4ef}body>header{padding:1rem;color:#eeeae2;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}body.light>header{color:#20211f}body>header :is(button,select){padding:8px 12px;border:1px solid #72746f;border-radius:8px;font:inherit}main.app-shell{display:block;min-height:0;max-width:1200px;margin:1rem auto;padding:20px;border:1px solid var(--line);border-radius:12px;background:var(--theme-surface)}main>p{margin:0 0 18px;font-size:12px;color:var(--muted);line-height:1.5}.example[hidden]{display:none}
</style><header><strong>BESC · Volledige dossiereditor</strong><select aria-label="Fichetype" id="kind">${options}</select><button id="theme">Licht/donker</button></header><main class="app-shell" data-theme="dark"><p><strong>Schermvoorbeeld van de app-opmaak.</strong> Bekijk de velden en wissel tussen tabbladen en fichetypes. Dit voorbeeld slaat niets op; de knoppen voor toevoegen, verwijderen en opslaan zijn uitgeschakeld. Er zijn geen echte dossiergegevens gebruikt.</p>${forms}</main><script>
document.querySelectorAll('form').forEach(form=>{form.addEventListener('submit',event=>event.preventDefault());form.querySelectorAll('button:not([role="tab"])').forEach(button=>button.disabled=true);form.querySelectorAll('[role="tab"]').forEach(button=>button.addEventListener('click',()=>{form.querySelectorAll('[role="tab"]').forEach(tab=>{tab.setAttribute('aria-selected',String(tab===button));tab.tabIndex=tab===button?0:-1});form.querySelectorAll('[role="tabpanel"]').forEach(panel=>panel.hidden=panel.id!==button.getAttribute('aria-controls'))}))});
document.querySelector('#kind').addEventListener('change',event=>document.querySelectorAll('.example').forEach(example=>example.hidden=example.dataset.kind!==event.target.value));document.querySelector('#theme').addEventListener('click',()=>{document.body.classList.toggle('light');document.querySelector('main').dataset.theme=document.body.classList.contains('light')?'light':'dark'});
</script></html>`;
const output=path.resolve(process.argv[2]??'../../outputs/dossiereditor-voorbeeld.html');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,html);process.stdout.write(output+'\n');
