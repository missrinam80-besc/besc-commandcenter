// Local, deterministic preparation only. Never connects to a database or publishes.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const sourceArg=process.argv.indexOf('--source');
if(sourceArg<0||!process.argv[sourceArg+1])throw Error('Use --source <snapshot directory> [--write]');
const source=resolve(process.argv[sourceArg+1]),root=new URL('../',import.meta.url);
const lf=b=>b.toString('utf8').replaceAll('\r\n','\n'),hash=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=readFileSync(resolve(source,'inhoud.json')),inventory=JSON.parse(lf(sourceBytes));
const mapping=JSON.parse(readFileSync(new URL('docs/f4/content-migration-register.json',root),'utf8'));
if(hash(lf(sourceBytes))!==mapping.source_sha256_lf)throw Error('Source snapshot hash differs from reviewed preparation');
if(mapping.records.length!==98||inventory.pages.length!==98)throw Error('Unexpected historical URL count');
const batch=hash(JSON.stringify({snapshot:hash(lf(sourceBytes)),mapping}));
const clean=s=>String(s??'').replaceAll('\ufffd','[onleesbaar teken]').replace(/\u0000/g,'').trim();
const records=mapping.records.map(r=>{
 const p=inventory.pages.find(p=>p.url===r.old_url&&p.file===r.source_file);if(!p)throw Error('Missing exact snapshot record '+r.id);
 const file=resolve(source,r.source_file),rel=relative(source,file);if(isAbsolute(rel)||rel.startsWith('..'))throw Error('Unsafe source path');
 const blockers=['Actualiteit en feitelijke claims nog beoordelen.','Inhoud, eventuele persoonsgegevens en publicatierechten nog beoordelen.'];
 if(!existsSync(file))blockers.push('Bronbestand ontbreekt; inhoud niet importeren.');
 if(String(p.text??'').includes('\ufffd'))blockers.push('Bron bevat onleesbare tekens; handmatig met het origineel vergelijken.');
 if(['legal_page','legacy_form'].includes(r.classification))blockers.push('Beleid en actuele verwerking/formulierwerking afzonderlijk vaststellen.');
 if(['external_commerce','media_page','partner_page','vacancy_page','event','historical_event'].includes(r.classification))blockers.push('Bestaande bron, rechten en aparte werkstroom koppelen; geen automatische publicatie.');
 if(inventory.errors.some(e=>e.url===r.old_url))blockers.push('Oorspronkelijke uitleesfout oplossen.');
 return {batch_id:batch,record_id:r.id,source_url:r.old_url,source_sha256:existsSync(file)?hash(lf(readFileSync(file))):hash(String(p.text??'')),snapshot_date:'2026-10-03',classification:r.classification,source_title:clean(r.source_title).slice(0,500),source_excerpt:clean(p.text).slice(0,6000),proposed_destination:r.proposed_destination,source_file:r.source_file,blockers};
});
const page=file=>inventory.pages.find(p=>p.file===file);
const welcome=String(page('homepage.txt').text),start=welcome.indexOf('Welkom bij de Belgian'),end=welcome.indexOf('Partners',start);
const privacy=String(page('privacyverklaring.txt').text),privacyStart=privacy.indexOf('Privacybeleid en GDPR-beleid'),privacyEnd=privacy.indexOf('Report abuse',privacyStart);
const contact=inventory.forms.find(f=>f.page==='contacteer-ons');if(start<0||end<start||privacyStart<0||privacyEnd<privacyStart||!contact)throw Error('Known draft extraction anchors changed');
const candidate=(record_id,slug,title,body,extra)=>({record_id,editorial_status:'unreviewed',current_facts_verified:false,rights_verified:false,blockers:extra,payload:{slug,locale:'nl-BE',title,summary:'Redactioneel concept uit de historische website-inventaris van 3 oktober 2026.',body:{format:'plain_text',value:clean(body).slice(0,16000)},navigation:false,links:[],hero:null}});
const candidates=[candidate('URL-003','over-besc','Over BESC',welcome.slice(start,end),['Positionering en actualiteit bevestigen; geen historische partnerlijst overnemen.']),candidate('URL-014','contact','Contact',contact.description,['Dit is de oude formulierbeschrijving; er is hiermee geen nieuw algemeen contactformulier gebouwd of geopend. Tekst en contactroute eerst vaststellen.']),candidate('URL-015','privacy','Privacy',privacy.slice(privacyStart,privacyEnd),['Historische juridische tekst; geen actuele conformiteitsverklaring. Verwerkingen, rollen, bewaarbehandeling en rechten eerst inhoudelijk beoordelen.'])];
const bundle={format:'besc-content-review-package-v1',source_snapshot_hash:hash(lf(sourceBytes)),source_date:'2026-10-03',current_site_crawled:false,live_changes:false,records,candidates,source_errors:inventory.errors};
const json=JSON.stringify(bundle,null,2)+'\n';
if(process.argv.includes('--write')){writeFileSync(new URL('src/lib/site-content-bundle.json',root),json);writeFileSync(new URL('docs/f4/content-review-package.json',root),json);}
console.log(JSON.stringify({prepared:true,records:records.length,candidates:candidates.length,source_errors:inventory.errors.length,batch_id:batch,output_sha256:hash(json),live_changes:false}));
