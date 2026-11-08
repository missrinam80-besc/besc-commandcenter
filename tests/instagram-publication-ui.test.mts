import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {InstagramPublicationPanel as Panel} from '../src/components/instagram-publication-panel.tsx';
import type {manageInstagramPublication as Action} from '../src/app/app/social/instagram-actions.ts';
const native=createRequire(import.meta.url),org='11111111-1111-4111-8111-111111111111',postId='22222222-2222-4222-8222-222222222222',accountId='33333333-3333-4333-8333-333333333333';
function fixture(options:{enabled?:boolean;role?:string;state?:string;error?:boolean}={}){
 const calls:string[]=[],updates:unknown[]=[],rpc:unknown[]=[];
 const post={platform:'Instagram',bundle_kind:'single',post_type:'publication',status:'approved',scheduled_at:'2030-01-01T12:00:00Z',instagram_image_url:'https://media.example.invalid/social-publication/'+org+'/'+'a'.repeat(64)+'.jpg',instagram_account_id:accountId};
 const supabase={from(table:string){calls.push(table);const query={select(){return query;},eq(){return query;},is(){return query;},update(value:unknown){updates.push(value);return query;},async maybeSingle(){return{data:table==='social_posts'?post:{id:accountId,account_name:'TESTFIXTURE account',external_account_id:'123'},error:null};},then(done:(value:unknown)=>void){done({data:[{id:accountId,account_name:'TESTFIXTURE account'}],error:null});}};return query;},async rpc(name:string,data:Record<string,unknown>){rpc.push({name,...data});return{data:options.state?[{id:postId,state:options.state,scheduled_at:post.scheduled_at,permalink:null,events:[{operation:'uncertain',created_at:post.scheduled_at}]}]:[],error:options.error?{message:'PRIVATE_TOKEN_DO_NOT_LEAK'}:null};}};
 const mocks={'@/lib/auth-context':{requireActiveMembership:async()=>{calls.push('auth');return{supabase,membership:{organization_id:org,role:options.role??'admin'}};}},'@/app/app/social/instagram-actions':{manageInstagramPublication:()=>{}},'@/lib/format':{formatDateTime:(v:string)=>v},'@/lib/instagram-publication-image':{verifyInstagramImage:async()=>{calls.push('image-verification');}},'next/navigation':{redirect:(href:string)=>{throw Error('REDIRECT '+href);}},'next/cache':{revalidatePath:()=>{calls.push('revalidate');}}};
 function load<T>(file:string):T{const compiled={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiled,exports:compiled.exports,URL,FormData,Object,Error,fetch:()=>{throw Error('No ambient HTTP');},process:{env:{BESC_INSTAGRAM_PUBLICATION_ENABLED:options.enabled===false?'false':'true',BESC_INSTAGRAM_PUBLICATION_MEDIA_ORIGIN:'https://media.example.invalid'}},require:(key:string)=>key in mocks?mocks[key as keyof typeof mocks]:native(key)});return compiled.exports as T;}
 return{calls,updates,rpc,post,panel:()=>load<{InstagramPublicationPanel:typeof Panel}>('components/instagram-publication-panel.tsx').InstagramPublicationPanel({id:postId}),action:(form:FormData)=>load<{manageInstagramPublication:typeof Action}>('app/app/social/instagram-actions.ts').manageInstagramPublication(form)};
}
function form(action:string,fields:Record<string,string>={}){const value=new FormData();for(const [k,v] of Object.entries({post:postId,action,...fields}))value.set(k,v);return value;}
test('Instagram-scherm en actie blijven standaard uit zonder database- of providercontact',async()=>{
 const f=fixture({enabled:false});assert.equal(await f.panel(),null);await assert.rejects(f.action(form('queue',{confirm:'yes'})),/uitgeschakeld/);assert.deepEqual(f.calls,[]);
});
test('Instagram-scherm vraagt afzonderlijke vrijgave en toont geen onbevestigde publicatie als succes',async()=>{
 const f=fixture(),html=renderToStaticMarkup(await f.panel() as React.ReactNode);assert.match(html,/Publicatie vrijgeven/);assert.match(html,/type="checkbox"/);assert.match(html,/Bekijk de gekozen JPEG/);assert.doesNotMatch(html,/>Gepubliceerd</);
});
test('Instagram-scherm houdt onzekerheid zichtbaar en biedt geen herhaling of annulering na dispatch',async()=>{
 const html=renderToStaticMarkup(await fixture({state:'uncertain'}).panel() as React.ReactNode);assert.match(html,/Uitkomst onzeker/);assert.match(html,/kan al op Instagram staan/);assert.doesNotMatch(html,/Publicatie vrijgeven|Geplande publicatie annuleren/);
});
test('Instagram-scherm geeft bij ontbrekend bewijs geen vrijgaveknop; gewone leden zien geen bediening',async()=>{
 const html=renderToStaticMarkup(await fixture({error:true}).panel() as React.ReactNode);assert.match(html,/niet worden gecontroleerd/);assert.doesNotMatch(html,/Publicatie vrijgeven|PRIVATE_TOKEN/);assert.equal(await fixture({role:'member'}).panel(),null);
});
test('Instagram-actie weigert ontbrekende bevestiging en gebruikt uitsluitend de huidige organisatie',async()=>{
 const f=fixture();await assert.rejects(f.action(form('queue')),/instagram-controle/);assert.deepEqual(f.rpc,[]);
 await assert.rejects(f.action(form('queue',{confirm:'yes',p_org:'foreign'})),/succes=instagram/);assert.deepEqual(f.rpc,[{name:'instagram_publication_owner',p_org:org,p_post:postId,p_action:'queue',p_job:null}]);
});
test('Instagram-actie verifieert de beheerde afbeelding en bewaart een servergekozen doel zonder publicatieoproep',async()=>{
 const f=fixture();await assert.rejects(f.action(form('image',{account:accountId,image_url:f.post.instagram_image_url})),/succes=instagram/);assert.ok(f.calls.indexOf('image-verification')<f.calls.lastIndexOf('social_posts'));
 assert.deepEqual(JSON.parse(JSON.stringify(f.updates)),[{instagram_account_id:accountId,instagram_target:{name:'TESTFIXTURE account',external_id:'123'},instagram_image_url:f.post.instagram_image_url,instagram_image_sha256:'a'.repeat(64)}]);assert.deepEqual(f.rpc,[]);
});
test('Instagram-actie weigert gewone leden en maskeert databasefouten',async()=>{
 const f=fixture({role:'member'});await assert.rejects(f.action(form('queue',{confirm:'yes'})),/rechten/);assert.deepEqual(f.rpc,[]);
 await assert.rejects(fixture({error:true}).action(form('queue',{confirm:'yes'})),error=>error instanceof Error&&/instagram-controle/.test(error.message)&&!error.message.includes('PRIVATE_TOKEN'));
});
