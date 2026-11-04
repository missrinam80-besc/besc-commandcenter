import {createHash} from 'node:crypto';
import {agentResultPayload} from './commandcenter-agent-contract.ts';

export const CONCEPT_DRIVE_FOLDER='https://drive.google.com/drive/u/0/folders/1GZLgcucq0Rzl6xo5yhFJlHa3r0IAfp7K';
export type DocumentJob={id:string;source_entity:string;source_id:string;source_version:string;source_snapshot:{title?:string};review:string};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');

// Deterministic ZIP (stored entries) keeps exports independently hashable, without
// adding a browser ZIP/parser dependency or fetching remote document contents.
function zip(files:Record<string,string>):Buffer {
  let offset=0;const data:Buffer[]=[],directory:Buffer[]=[];
  for(const [name,text] of Object.entries(files)){
    const filename=Buffer.from(name),content=Buffer.from(text);let crc=0xffffffff;
    for(const byte of content){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(content.length,18);local.writeUInt32LE(content.length,22);local.writeUInt16LE(filename.length,26);
    data.push(local,filename,content);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);
    central.writeUInt32LE(crc,16);central.writeUInt32LE(content.length,20);central.writeUInt32LE(content.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    directory.push(central,filename);offset+=local.length+filename.length+content.length;
  }
  const footer=Buffer.alloc(22),count=Object.keys(files).length,dir=Buffer.concat(directory);
  footer.writeUInt32LE(0x06054b50);footer.writeUInt16LE(count,8);footer.writeUInt16LE(count,10);footer.writeUInt32LE(dir.length,12);footer.writeUInt32LE(offset,16);
  return Buffer.concat([...data,dir,footer]);
}
export function sourceTimestamp(value:string):bigint{
  const m=/^(.+?)(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!m||!Number.isFinite(Date.parse(m[1]+m[3])))throw Error('agent_source_conflict');
  return BigInt(Date.parse(m[1]+m[3]))*BigInt(1000)+BigInt((m[2]??'').padEnd(6,'0'));
}
export function buildAgentDocument(job:DocumentJob,payload:unknown){
  const result=agentResultPayload.parse(payload);
  if(job.review!=='accepted')throw Error('agent_review_required');
  if(sourceTimestamp(job.source_version)!==sourceTimestamp(result.sourceVersion))throw Error('agent_source_conflict');
  const paragraphs:{text:string;style?:string}[]=[
    {text:'Conceptdocument '+String(job.source_snapshot.title??'BESC dossier').replace(/[^\p{L}\p{N} ]/gu,' ').trim(),style:'Title'},
    {text:'Dit document bevat een door de gebruiker beoordeeld agentvoorstel. Het is geen formele dossierafsluiting, publicatie of financieel bewijs. Controleer de gegevens voordat je het document verder gebruikt.'},
    {text:'Bron en bewijsgrens',style:'Heading1'},
    {text:`CC opdracht: ${job.id}`},{text:`Brondossier: ${job.source_entity} / ${job.source_id}`},{text:`Bronversie: ${job.source_version}`},
    {text:result.summary},
    ...result.findings.flatMap((f,i)=>[{text:`Controlepunt ${i+1}`,style:'Heading1'},{text:`${({confirmed:'Bevestigd door agent',uncertain:'Onzeker',proposal:'Voorstel'})[f.classification]}: ${f.statement}`}]),
    {text:'Overdracht en gebruik',style:'Heading1'},
    {text:'Status: concept. CC blijft de bron voor de opdracht, beoordeling en dossierstatus. Plaats dit bestand alleen in de afgesproken afgeschermde Drive-map en controleer de bestaande deelrechten. Leg de definitieve documentlink daarna vast in CC. Er is geen automatische Drive-upload of wijziging van deelrechten uitgevoerd.'},
  ];
  const body=paragraphs.map(p=>`<w:p>${p.style?`<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>`:''}<w:r><w:t xml:space="preserve">${escape(p.text)}</w:t></w:r></w:p>`).join('');
  const bytes=zip({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
    'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/><w:keepNext/></w:pPr><w:rPr><w:color w:val="000000"/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="30"/></w:rPr></w:style></w:styles>',
  });
  return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),filename:`BESC-concept-${job.id}.docx`};
}
