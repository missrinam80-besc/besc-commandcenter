/* eslint-disable @typescript-eslint/no-require-imports -- Build-time, fixed catalog compilation; not a user-supplied SQL generator. */
const fs=require('node:fs');
const {tables,catalog}=require('./build-dossier-editor-schema.cjs');
const referenceOverrides={person_id:'community_people',responsible_person_id:'community_people',community_person_id:'community_people',asset_id:'assets',owner_person_id:'community_people',member_id:'association_members'};
function definition(cfg,capability){
 const columns=tables[cfg.table];
 return {...cfg,capability:cfg.capability??capability,key:cfg.key??'id',org:!!columns.organization_id,soft:!!columns.deleted_at,
  actors:['created_by','updated_by','author_id','submitted_by'].filter(name=>columns[name]),updated:!!columns.updated_at,
  references:cfg.fields.map(name=>({field:name,table:referenceOverrides[name]??columns[name]?.sql.match(/references\s+public\.(\w+)\(/i)?.[1]})).filter(ref=>ref.table).map(ref=>({...ref,org:!!tables[ref.table]?.organization_id,soft:!!tables[ref.table]?.deleted_at}))};
}
const fixed=Object.fromEntries(Object.entries(catalog).map(([kind,cfg])=>[kind,{...definition(cfg,cfg.capability),collections:cfg.collections.map(part=>definition(part,cfg.capability))}]));
const template=fs.readFileSync('scripts/dossier-editor-transaction.sql','utf8');
const sql=template.replace('__FIXED_CATALOG__',JSON.stringify(fixed).replaceAll("'","''"));
const target='supabase/migrations/20261008094405_unified_dossier_editor.sql';
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==sql)throw Error('Transaction catalog differs');}else fs.writeFileSync(target,sql);
