// Reviewed read-page adjustments, preserving the existing explicit Gmail action.
import fs from 'node:fs';
import ts from 'typescript';
const file='src/app/app/nieuwsbrieven/[id]/page.tsx';
let text=fs.readFileSync(file,'utf8');
const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let replacement;
function visit(node){if(ts.isJsxExpression(node)&&node.expression&&ts.isConditionalExpression(node.expression)&&node.expression.condition.getText(source)==='canEdit')replacement={start:node.getStart(source),end:node.end};ts.forEachChild(node,visit);}visit(source);
if(replacement){
 const markup=`<section className="form-card email-preview"><div className="form-heading"><h2>{item.subject}</h2>{canEdit&&<Link className="primary" href="?bewerken=1">Bewerken</Link>}</div><pre>{item.body_text}</pre>{canEdit&&<form action={saveNewsletter}><input type="hidden" name="id" value={item.id}/>{["mailing_list_id","email_template_id","title","subject","body_text","template_variant","preheader","hero_image_url","hero_image_alt"].map(field=><input key={field} type="hidden" name={field} value={String(item[field]??"")}/>)}<button>Gmail-concept bijwerken</button></form>}</section>`;
 text=text.slice(0,replacement.start)+markup+text.slice(replacement.end);
 text=text.replace('import { newsletterVariantLabels } from "@/lib/newsletter-html";\n','');
 text=text.replace('const [newsletterResult, listsResult] = await Promise.all([','const [newsletterResult] = await Promise.all([');
 text=text.replace(/\s*supabase\.from\("mailing_lists"\)\.select\("id,name,status"\)[^\n]+\n/,'\n');
 text=text.replace('{!["sent", "failed"].includes(item.status)', '{item.body_html && !["sent", "failed"].includes(item.status)');
 text=text.replace('import { Send, Users }','import { Send }');
 fs.writeFileSync(file,text);
}
const adminFile='src/app/app/administratie/page.tsx';let admin=fs.readFileSync(adminFile,'utf8');
for(const [list,kind]of Object.entries({members:'member',mandates:'mandate',deadlines:'deadline',documents:'administration'})){
 const regex=new RegExp(`(${list==='deadlines'?'\\(overdueOnly \\? overdue : deadlines\\)':list}\\.map\\(\\(item\\) => <article key=\\{item.id\\}>)(?!<Link)`);
 admin=admin.replace(regex,`$1<Link className="row-action" href={\`?bewerken=\${item.id}&fiche=${kind}\`}>Bewerken</Link>`);
}
fs.writeFileSync(adminFile,admin);
