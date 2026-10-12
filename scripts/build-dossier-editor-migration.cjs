/* eslint-disable @typescript-eslint/no-require-imports -- Build-time, fixed catalog compilation; not a user-supplied SQL generator. */
const fs=require('node:fs');
const path=require('node:path');
const latestCatalog=fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('_editor_catalog.sql')).sort().at(-1);
const historicTarget='supabase/migrations/20261008094405_unified_dossier_editor.sql';
const checking=process.argv.includes('--check');
const outputIndex=process.argv.indexOf('--output');
const target=outputIndex>=0?process.argv[outputIndex+1]:latestCatalog?'supabase/migrations/'+latestCatalog:historicTarget;
if(!checking){
 if(outputIndex<0)throw Error('Historische migraties worden niet overschreven. Maak eerst een nieuwe lege migratie met supabase migration new en geef --output <bestand>.');
 if(!target||path.dirname(path.resolve(target))!==path.resolve('supabase/migrations')||!/^\d{14}_[\w-]+\.sql$/.test(path.basename(target)))throw Error('Output moet een nieuwe migratie in supabase/migrations zijn.');
 if(path.resolve(target)===path.resolve(historicTarget)||!fs.existsSync(target)||fs.statSync(target).size!==0)throw Error('Alleen een bestaand leeg, nieuw migratiebestand mag worden gevuld.');
}
const {tables,catalog}=require('./build-dossier-editor-schema.cjs');
const referenceOverrides={person_id:'community_people',responsible_person_id:'community_people',community_person_id:'community_people',asset_id:'assets',owner_person_id:'community_people',repair_asset_id:'assets',member_id:'association_members'};
function definition(cfg,capability){
 const columns=tables[cfg.table];
 return {...cfg,capability:cfg.capability??capability,key:cfg.key??'id',org:!!columns.organization_id,soft:!!columns.deleted_at,
  actors:['created_by','updated_by','author_id','submitted_by'].filter(name=>columns[name]),updated:!!columns.updated_at,
  references:cfg.fields.map(name=>({field:name,table:referenceOverrides[name]??columns[name]?.sql.match(/references\s+public\.(\w+)\(/i)?.[1]})).filter(ref=>ref.table).map(ref=>({...ref,org:!!tables[ref.table]?.organization_id,soft:!!tables[ref.table]?.deleted_at}))};
}
const fixed=Object.fromEntries(Object.entries(catalog).map(([kind,cfg])=>[kind,{...definition(cfg,cfg.capability),collections:cfg.collections.map(part=>definition(part,cfg.capability))}]));
const template=fs.readFileSync('scripts/dossier-editor-transaction.sql','utf8');
const sql=template.replace('__FIXED_CATALOG__',JSON.stringify(fixed).replaceAll("'","''")).replace('create function public.save_dossier_bundle','create or replace function public.save_dossier_bundle');
if(checking){if(fs.readFileSync(target,'utf8')!==sql)throw Error('Transaction catalog differs');}else fs.writeFileSync(target,sql);
