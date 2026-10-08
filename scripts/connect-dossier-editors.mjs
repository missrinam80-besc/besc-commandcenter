// One-time reviewed wiring: only the explicitly listed dossier pages.
import fs from 'node:fs';
import ts from 'typescript';
const pages={
 'events':'event','projecten':'project','taken':'task','content':'content','vergaderingen':'meeting','kennisbank':'knowledge','materialen':'asset','nieuwsbrieven':'newsletter','inbox':'inbox',
};
const targets=[];
for(const [folder,kind] of Object.entries(pages)){
 for(const detail of [false,true]){const file=`src/app/app/${folder}/${detail?'[id]/':''}page.tsx`;if(fs.existsSync(file))targets.push({file,args:`kind:"${kind}"${detail?',id':''}`});}
}
for(const [folder,kind]of Object.entries({'financien/budgetten':'budget','financien/kosten':'expense','financien/inkomsten':'income','shop/producten':'product','shop/lanceringen':'launch'}))targets.push({file:`src/app/app/${folder}/[id]/page.tsx`,args:`kind:"${kind}",id`});
for(const [folder,group]of Object.entries({financien:'finance',shop:'shop',administratie:'administration'}))targets.push({file:`src/app/app/${folder}/page.tsx`,args:`group:"${group}"`});
targets.push({file:'src/components/operational-module-page.tsx',args:'module'},{file:'src/components/operational-record-detail.tsx',args:'module,id'});
for(const {file,args}of targets){
 const text=fs.readFileSync(file,'utf8');if(text.includes('dossierEditorGate('))continue;
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let insertion=null,name=null;
 function visit(node){if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations){if(ts.isIdentifier(d.name)&&d.initializer&&ts.isAwaitExpression(d.initializer)&&d.initializer.expression.getText(source)==='searchParams'){insertion=node.end;name=d.name.text;}}ts.forEachChild(node,visit);}
 visit(source);
 if(insertion===null){const match=text.match(/const\s+\[\{\s*id\s*\},\s*(\w+)\]\s*=\s*await Promise\.all\(\[params,\s*searchParams\]\);/);if(match){insertion=match.index+match[0].length;name=match[1];}}
 if(insertion===null)throw Error('No searchParams statement in '+file);
 const added=`\n  const unifiedEditor = await dossierEditorGate({${args},query:${name}});\n  if (unifiedEditor) return unifiedEditor;\n`;
 fs.writeFileSync(file,'import { dossierEditorGate } from "@/components/dossier-editor-gate";\n'+text.slice(0,insertion)+added+text.slice(insertion));
 process.stdout.write(file+'\n');
}
