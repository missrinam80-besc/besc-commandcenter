// Documentation/package checks only. No application operation or network call.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const base=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(base,'../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const m=read('manifest.json');
assert.equal(m.status,'prepared_for_review_not_implemented');
assert.equal(m.live_changes,false);assert.equal(m.application_tests_executed,false);
assert.equal(m.implementation_authorized_by_this_package,false);
assert.equal(m.packages.length,8);
assert.deepEqual(m.packages.map(p=>p.id),Array.from({length:8},(_,i)=>'F4.'+i));
for(const p of m.packages){assert.equal(p.status,'planned');for(const d of p.depends_on)assert(m.packages.find(q=>q.id===d));}
const cases=read('acceptatiegevallen.json');
assert.equal(cases.cases.length,46);assert.equal(new Set(cases.cases.map(c=>c.id)).size,46);
for(const c of cases.cases){assert(m.packages.some(p=>p.id===c.package));assert.equal(c.status,'planned');assert.equal(c.actual_result,null);assert.deepEqual(c.evidence,[]);assert(['package','minimum_build','preproduction'].includes(c.timing));}
for(const p of m.packages)assert(cases.cases.some(c=>c.package===p.id));
const urls=read('content-migration-register.json');
assert.equal(urls.current_site_crawled,false);assert.equal(urls.production_redirects_authorized,false);
assert.equal(urls.records.length,98);assert.equal(new Set(urls.records.map(r=>r.old_url)).size,98);
for(const r of urls.records){assert.equal(r.decision_status,'proposed_requires_review');assert.equal(r.redirect_status,'not_implemented');assert.equal(r.content_status,'not_imported');assert.equal(r.rights_verified,false);assert.equal(r.current_facts_verified,false);assert(r.proposed_action);assert(r.proposed_destination===null||r.proposed_destination.startsWith('/')&&!r.proposed_destination.startsWith('//'));}
assert.equal(urls.source_errors.length,1);
const open=read('open-afhankelijkheden.json');assert.equal(open.f2_partial_cases.length,38);assert.deepEqual(open.f2_skipped_by_user,['P10']);assert.equal(open.f2_full_acceptance,false);assert.equal(open.f3_original_cases.length,53);assert.equal(open.f4_application_tests_executed,false);
const contract=read('contracts/platform-contract.json');
assert.equal(contract.status,'proposed_not_implemented');assert.equal(contract.staging_anonymous_access,false);assert.equal(contract.website_direct_business_table_reads,false);assert.equal(contract.success_requires_commit,true);assert.equal(contract.new_runtime_flags_default,'off');
assert.deepEqual(contract.public_types,['creator','partner','vacancy','page']);
const schema=read('contracts/public.schema.json');assert.equal(schema.oneOf.length,4);
for(const variant of schema.oneOf){assert.equal(variant.additionalProperties,false);for(const field of contract.public_projection_forbidden_fields)assert(!Object.hasOwn(variant.properties,field));}
const fixtures=read('contracts/fixtures.json');assert.equal(fixtures.synthetic,true);assert.equal(fixtures.publication_authorized,false);assert.equal(fixtures.items.length,4);
for(const f of fixtures.items){const v=schema.oneOf.find(s=>s.properties.type.const===f.type);assert(v);for(const k of v.required)assert(Object.hasOwn(f,k));for(const k of Object.keys(f))assert(Object.hasOwn(v.properties,k));assert(JSON.stringify(f).includes('TESTFIXTURE'));}
const intake=read('contracts/intake.schema.json');assert.equal(intake.oneOf.length,3);for(const v of intake.oneOf){assert.equal(v.additionalProperties,false);for(const k of contract.identity_fields_server_derived)assert(!Object.hasOwn(v.properties,k));}
const api=read('contracts/api-operations.json');assert.equal(api.operations.length,19);assert.equal(api.status,'proposed_not_implemented');for(const op of api.operations){assert.equal(op.implemented,false);assert(op.path.startsWith('/api/v1/platform/'));assert(['GET','POST'].includes(op.method));}
const sources=read('bronregister.json');let verified=0,externalAvailable=0;
for(const s of sources.code_sources.filter(s=>s.repository==='commandcenter')){assert.equal(hash(path.join(repo,s.path)),s.sha256_lf,s.path);verified++;}
for(const s of sources.local_reference_sources)if(fs.existsSync(s.path)){assert.equal(hash(s.path),s.sha256_lf);externalAvailable++;}
let links=0;for(const f of fs.readdirSync(base).filter(n=>n.endsWith('.md'))){for(const match of fs.readFileSync(path.join(base,f),'utf8').matchAll(/\]\(([^)]+)\)/g)){if(/^https?:/.test(match[1]))continue;assert(fs.existsSync(path.resolve(base,match[1].split('#')[0])),f+': '+match[1]);links++;}}
console.log(JSON.stringify({preparation_valid:true,packages:8,planned_cases:46,historical_urls:98,f2_partial_preserved:38,f3_case_ids_preserved:53,cc_source_hashes_verified:verified,external_references_available:externalAvailable,local_links_checked:links,application_tests_executed:false,live_changes:false}));
