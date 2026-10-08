/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS build-time loader for the reviewed TypeScript catalog. */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache={};
function load(name){const file=path.resolve(name);if(cache[file])return cache[file];const compiled={exports:{}};
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(compiled,compiled.exports,id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id));
 return cache[file]=compiled.exports;}
const {dossierEditorCatalog:catalog}=load('src/lib/dossier-editor-catalog.ts');
function split(sql,separator=',') {const out=[];let level=0,quote=false,start=0;for(let i=0;i<sql.length;i++){const c=sql[i];if(c==="'"){if(quote&&sql[i+1]==="'"){i++;continue;}quote=!quote;}if(quote)continue;if(c==='(')level++;if(c===')')level--;if(c===separator&&level===0){out.push(sql.slice(start,i));start=i+1;}}out.push(sql.slice(start));return out;}
function close(sql,start){let level=1,quote=false;for(let i=start;i<sql.length;i++){const c=sql[i];if(c==="'"){if(quote&&sql[i+1]==="'"){i++;continue;}quote=!quote;}if(quote)continue;if(c==='(')level++;if(c===')'&&--level===0)return i;}throw Error('Unclosed schema');}
const tables={},enums={};
const files=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort();
for(const file of files){const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');
 for(const m of sql.matchAll(/create type public\.(\w+) as enum\s*\(([^;]+)\)/gi))enums[m[1]]=Array.from(m[2].matchAll(/'([^']*)'/g),v=>v[1]);
 for(const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(/gi)){const name=m[1],start=m.index+m[0].length,body=sql.slice(start,close(sql,start));tables[name]??={};
  for(const fragment of split(body)){const col=fragment.trim().match(/^(\w+)\s+((?:public\.)?\w+(?:\[\])?(?:\([\d,]+\))?)([\s\S]*)$/i);if(col&&!['check','foreign','primary','unique','constraint'].includes(col[1].toLowerCase()))tables[name][col[1]]={type:col[2],sql:fragment};}
 }
 for(const m of sql.matchAll(/alter table (?:only )?public\.(\w+)\s+([^;]+);/gi)){if(!tables[m[1]])continue;for(const fragment of split(m[2])){const add=fragment.trim().match(/^add (?:column )?(?:if not exists )?(\w+)\s+((?:public\.)?\w+(?:\[\])?(?:\([\d,]+\))?)([\s\S]*)$/i);if(add&&!['constraint','check','foreign','unique','primary'].includes(add[1]))tables[m[1]][add[1]]={type:add[2],sql:fragment};}}
 for(const m of sql.matchAll(/alter table (?:only )?public\.(\w+)\s+([^;]+);/gi)){
  if(!tables[m[1]])continue;
  for(const drop of m[2].matchAll(/alter column (\w+) drop not null/gi))if(tables[m[1]][drop[1]])tables[m[1]][drop[1]].sql=tables[m[1]][drop[1]].sql.replace(/\bnot null\b/gi,'');
  for(const checked of m[2].matchAll(/\b(\w+)\s+in\s*\(([^)]+)\)/gi))if(tables[m[1]][checked[1]])tables[m[1]][checked[1]].options=Array.from(checked[2].matchAll(/'([^']*)'/g),v=>v[1]);
 }
 for(const m of sql.matchAll(/alter type public\.(\w+) add value (?:if not exists )?'([^']+)'/gi))if(enums[m[1]]&&!enums[m[1]].includes(m[2]))enums[m[1]].push(m[2]);
}
const output={};let errors=[];
for(const [kind,cfg]of Object.entries(catalog)){
 output[kind]={};for(const def of [cfg,...cfg.collections]){
  if(!tables[def.table]){errors.push('Unknown table '+def.table);continue;}
  output[kind][def.table]=def.fields.map(name=>{
   const column=tables[def.table][name];if(!column){errors.push(`${kind}.${def.table}.${name}`);return null;}
   const enumName=column.type.replace('public.',''),inCheck=column.sql.match(new RegExp(`\\b${name}\\s+in\\s*\\(([^)]+)\\)`,'i'));
   const options=column.options||enums[enumName]|| (inCheck?Array.from(inCheck[1].matchAll(/'([^']*)'/g),v=>v[1]):[]);
   const defaultMatch=column.sql.match(/\bdefault\s+('(?:[^']|'')*'|true|false|-?\d+(?:\.\d+)?)/i);
   let value=defaultMatch?defaultMatch[1]:null;if(value?.startsWith("'"))value=value.slice(1,-1).replace(/''/g,"'");
   if(column.type.endsWith('[]')&&value==='{}')value=[];
   if(value==='true'||value==='false')value=value==='true';
   if(typeof value==='string'&&/^(integer|bigint|smallint|numeric|decimal)/.test(column.type))value=Number(value);
   const reference=column.sql.match(/references\s+public\.(\w+)\(/i)?.[1];
   return {name,type:column.type,required:/\bnot null\b/i.test(column.sql)&&!(/\bdefault\b/i.test(column.sql)),default:value,options,reference:reference||null};
  });
 }
}
if(errors.length)throw Error('Catalogusvelden ontbreken in schema:\n'+errors.join('\n'));
const target='src/lib/dossier-editor-schema.json',text=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==text)throw Error('Editor schema is verouderd');}else fs.writeFileSync(target,text);
process.stdout.write(`Gecontroleerd: ${Object.keys(output).length} dossiermodellen\n`);
module.exports={tables,catalog};
