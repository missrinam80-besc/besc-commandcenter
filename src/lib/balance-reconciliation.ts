export type BalanceAccount={userId:string;xp:string;bucks:string;reserved:string};
export type BalanceSnapshot={schemaVersion:1;source:'BESC_CC';organizationId:string;capturedAt:string;accounts:BalanceAccount[];accountsDigest:string;ledgerCount:number;ledgerDigest:string;mode:'comparison_only'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const decimal=/^(0|[1-9]\d{0,18})$/;
const amount=(value:unknown):value is string=>typeof value==='string'&&decimal.test(value)&&BigInt(value)<=BigInt('9223372036854775807');
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
export function parseBalanceSnapshot(input:unknown):BalanceSnapshot{
 if(!object(input)||!keys(input,['schemaVersion','source','organizationId','capturedAt','accounts','accountsDigest','ledgerCount','ledgerDigest','mode'])||input.schemaVersion!==1||input.source!=='BESC_CC'||input.mode!=='comparison_only'||typeof input.organizationId!=='string'||!uuid.test(input.organizationId)||typeof input.capturedAt!=='string'||!Number.isFinite(Date.parse(input.capturedAt))||!Array.isArray(input.accounts)||input.accounts.length>5000||!Number.isSafeInteger(input.ledgerCount)||Number(input.ledgerCount)<0||Number(input.ledgerCount)>100000||typeof input.accountsDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.accountsDigest)||typeof input.ledgerDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.ledgerDigest))throw Error('invalid_snapshot');
 const seen=new Set<string>();for(const a of input.accounts){if(!object(a)||!keys(a,['userId','xp','bucks','reserved'])||typeof a.userId!=='string'||!uuid.test(a.userId)||seen.has(a.userId)||!amount(a.xp)||!amount(a.bucks)||!amount(a.reserved)||BigInt(a.reserved)>BigInt(a.bucks))throw Error('invalid_snapshot');seen.add(a.userId);}
 return input as BalanceSnapshot;
}
export function balanceSnapshotMaterial(snapshot:BalanceSnapshot){return [...snapshot.accounts].sort((a,b)=>a.userId<b.userId?-1:a.userId>b.userId?1:0).map(a=>[a.userId,a.xp,a.bucks,a.reserved].join('|')).join('\n');}
type ExternalRow={externalId:string;userId:string;bucks:string};
export function parseExternalBalances(csv:string):ExternalRow[]{
 if(csv.length>2*1024*1024)throw Error('file_too_large');
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 const push=()=>{row.push(field);field='';closed=false;if(row.length>3)throw Error('invalid_csv');};
 for(let i=csv.charCodeAt(0)===0xfeff?1:0;i<csv.length;i++){
  const c=csv[i];if(quoted){if(c==='"'){if(csv[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
  else if(c==='"'&&!field&&!closed)quoted=true;
  else if(c===',')push();
  else if(c==='\n'||c==='\r'){if(c==='\r'&&csv[i+1]==='\n')i++;push();if(row.some(v=>v.length))rows.push(row);row=[];}
  else{if(closed||c==='"')throw Error('invalid_csv');field+=c;}
  if(field.length>128||rows.length>10001)throw Error('invalid_csv');
 }
 if(quoted)throw Error('invalid_csv');if(field||row.length||closed){push();rows.push(row);}
 if(rows.shift()?.join(',')!=='external_id,cc_user_id,bucks'||rows.length<1||rows.length>10000)throw Error('invalid_csv');
 return rows.map(r=>{if(r.length!==3||!(/^(twitch:[1-9]\d{0,19}|discord:[1-9]\d{16,19})$/).test(r[0])||(r[1]!==''&&!uuid.test(r[1].toLowerCase()))||!amount(r[2]))throw Error('invalid_csv');return{externalId:r[0],userId:r[1].toLowerCase(),bucks:r[2]};});
}
export function reconcileBalances(snapshot:BalanceSnapshot,csv:string,declaredTotal:string|null,externalDigest:string){
 if(!/^[a-f0-9]{64}$/.test(externalDigest)||declaredTotal!==null&&!/^(0|[1-9]\d{0,24})$/.test(declaredTotal))throw Error('invalid_total');
 const rows=parseExternalBalances(csv),accounts=new Map(snapshot.accounts.map(a=>[a.userId,a]));
 const externalCounts=new Map<string,number>(),accountCounts=new Map<string,number>();
 for(const r of rows){externalCounts.set(r.externalId,(externalCounts.get(r.externalId)??0)+1);if(r.userId)accountCounts.set(r.userId,(accountCounts.get(r.userId)??0)+1);}
 const details=rows.map(r=>{
  const cc=accounts.get(r.userId),issues:string[]=[];
  if(externalCounts.get(r.externalId)!==1)issues.push('duplicate_external_id');if(r.userId&&accountCounts.get(r.userId)!==1)issues.push('ambiguous_account');
  if(!cc)issues.push(r.userId?'unknown_cc_account':'unmapped_account');if(cc&&BigInt(r.bucks)<BigInt(cc.reserved))issues.push('external_below_reserved');
  return{externalId:r.externalId,userId:r.userId||null,externalBucks:r.bucks,ccBucks:cc?.bucks??null,ccReserved:cc?.reserved??null,difference:cc?(BigInt(r.bucks)-BigInt(cc.bucks)).toString():null,issues};
 });
 const externalTotal=rows.reduce((sum,r)=>sum+BigInt(r.bucks),BigInt(0)).toString();
 return{schemaVersion:1,mode:'comparison_only' as const,organizationId:snapshot.organizationId,capturedAt:snapshot.capturedAt,accountsDigest:snapshot.accountsDigest,ledgerDigest:snapshot.ledgerDigest,externalDigest,
  externalTotal,declaredTotal,totalMatches:declaredTotal!==null&&declaredTotal===externalTotal,
  ccTotal:snapshot.accounts.reduce((sum,a)=>sum+BigInt(a.bucks),BigInt(0)).toString(),ccReserved:snapshot.accounts.reduce((sum,a)=>sum+BigInt(a.reserved),BigInt(0)).toString(),
  ccAccountsOutsideFile:snapshot.accounts.filter(a=>!accountCounts.has(a.userId)).map(a=>a.userId),rows:details,
  comparisonComplete:declaredTotal===externalTotal&&details.every(r=>r.issues.length===0),mappingVerifiedBySystem:false,executionAuthorized:false,wouldWrite:false,requiresDecision:true,
  coverage:'Only explicitly mapped rows are compared. Values are not added, imported or converted into a target balance.'};
}
