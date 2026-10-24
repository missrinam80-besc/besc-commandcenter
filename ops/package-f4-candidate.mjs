import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => { const i=process.argv.indexOf(name); return i<0?null:process.argv[i+1]; };
const check = process.argv.includes('--check');
const website = fs.realpathSync(arg('--website') || '../besc-website-f2');
const out = arg('--output');
const expect = (ok,msg) => {if(!ok)throw Error(msg);};
const hash = b => createHash('sha256').update(b).digest('hex');
const text = file => fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const git = (dir,...args) => execFileSync('git',['-c','safe.directory='+dir,'-C',dir,...args],{encoding:'utf8'}).trim();
expect(website !== root,'Separate repositories required');
expect(git(root,'remote','get-url','origin') === 'https://github.com/missrinam80-besc/besc-commandcenter.git','Unexpected CC remote');
expect(git(website,'remote','get-url','origin') === 'https://github.com/missrinam80-besc/besc-website.git','Unexpected website remote');
const stages = ['creator','intake','partner','vacancy','delegation','content','contact'];
let previous;
const migrations = [];
const copies = new Map();
for(const stage of stages){
 const name='ops/f4-'+stage+'-release-manifest.json';
 const m=JSON.parse(text(path.join(root,name)));
 expect(m.live_cloud_apply_authorized === false && m.runtime_default === 'off','Unexpected authority');
 if(previous) expect(JSON.stringify(m.historical_migrations) === JSON.stringify([...previous.historical_migrations,...previous.migrations]),'Broken manifest chain');
 previous=m;
 copies.set(name,text(path.join(root,name)));
 for(const x of m.migrations){
  const sql=text(path.join(root,'supabase/migrations',x.file));
  expect(hash(sql) === x.sha256_lf,'SQL hash mismatch: '+x.file);
  migrations.push(x);copies.set('migrations/'+x.file,sql);
 }
}
const excluded='20261001110000_seed_operational_guidelines.sql';
const first=JSON.parse(text(path.join(root,'ops/f4-creator-release-manifest.json')));
const baseline=first.historical_migrations.filter(x=>x.file!==excluded);
expect(baseline.length===126 && migrations.length===7,'Wrong migration count');
for(const x of first.historical_migrations) expect(hash(text(path.join(root,'supabase/migrations',x.file)))===x.sha256_lf,'Historical SQL changed');
const pairs=[['f4-contract.ts','creator-contract.ts'],['f4-intake-contract.ts','intake-contract.ts'],['f4-partner-contract.ts','partner-contract.ts'],['vacancy-contract.ts','vacancy-contract.ts'],['delegation-contract.ts','delegation-contract.ts'],['site-content-contract.ts','site-content-contract.ts']];
const contracts=pairs.map(([cc,web])=>{
 const a=fs.readFileSync(path.join(root,'src/lib',cc)),b=fs.readFileSync(path.join(website,'src/lib',web));
 expect(a.equals(b),'Contract mismatch: '+cc);return {cc,website:web,sha256:hash(a)};
});
const flags=['BESC_CREATOR_PLATFORM_ENABLED','BESC_PLATFORM_INTAKE_ENABLED','BESC_PARTNER_PLATFORM_ENABLED','BESC_VACANCY_PLATFORM_ENABLED','BESC_PARTNER_DELEGATION_ENABLED','BESC_SITE_PAGES_ENABLED','BESC_SITE_REDIRECTS_ENABLED','BESC_GENERAL_CONTACT_ENABLED'];
for(const repo of [root,website])for(const f of flags)expect(text(path.join(repo,'.env.example')).split('\n').includes(f+'=false'),'Default flag missing: '+f);
const dirty={cc:!!git(root,'status','--porcelain'),website:!!git(website,'status','--porcelain')};
if(!check)expect(!dirty.cc&&!dirty.website,'Commit reviewed source before packaging');
const manifest={format:'besc-f4-candidate-v1',deployment_ready:false,database_apply_authorized:false,images:{cc:null,website:null},source_commits:{cc:git(root,'rev-parse','HEAD'),website:git(website,'rev-parse','HEAD')},baseline_count:126,expected_after:133,excluded_seed:excluded,migrations,contracts,runtime_flags_default_off:flags,missing_gates:['review_and_merge_each_repository','green_image_builds_and_exact_digests','fresh_readonly_cloud_and_server_preflight','verified_backup_and_isolated_restore','separate_database_and_server_release_approval','separate_runtime_activation_and_content_decisions','full_preproduction_acceptance']};
copies.set('CANDIDATE.json',JSON.stringify(manifest,null,2)+'\n');
copies.set('baseline-history.json',JSON.stringify(baseline,null,2)+'\n');
for(const name of fs.readdirSync(path.join(root,'docs/f4')).filter(n=>n.startsWith('Implementatie-')&&n.endsWith('.md')))copies.set('docs/'+name,text(path.join(root,'docs/f4',name)));
for(const name of ['Oplevering-F4.md','acceptatiegevallen.json','open-afhankelijkheden.json','content-review-package.json'])copies.set('docs/'+name,text(path.join(root,'docs/f4',name)));
for(const name of ['verify-f4-candidate.mjs','f4-server-preflight.sh'])copies.set(name,text(path.join(root,'ops',name)));
console.log(JSON.stringify({candidate_check:true,files:copies.size,dirty,history_before:126,history_after:133,deployment_ready:false}));
if(check)process.exit(0);
expect(out,'--output requires a new directory');
const dest=path.resolve(out);expect(!fs.existsSync(dest),'Output already exists');
expect(!dest.startsWith(root+path.sep)&&!dest.startsWith(website+path.sep),'Output must remain outside source repositories');
fs.mkdirSync(dest,{recursive:false});
for(const [name,body]of copies){fs.mkdirSync(path.dirname(path.join(dest,name)),{recursive:true});fs.writeFileSync(path.join(dest,name),body,'utf8');}
fs.writeFileSync(path.join(dest,'SHA256SUMS'),[...copies.keys()].sort().map(name=>hash(fs.readFileSync(path.join(dest,name)))+'  '+name).join('\n')+'\n');
execFileSync(process.execPath,[path.join(dest,'verify-f4-candidate.mjs')],{stdio:'inherit'});
