// Offline only. Normalized explicit mappings; no export fetch, import or booking.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseBalanceSnapshot,balanceSnapshotMaterial,reconcileBalances} from '../src/lib/balance-reconciliation.ts';
const arg=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('missing_argument');return process.argv[i+1];};
try{
 const snapshotPath=arg('--snapshot'),csvPath=arg('--external'),output=arg('--output'),total=arg('--total');
 for(const file of [snapshotPath,csvPath])if((await fs.stat(file)).size>2*1024*1024)throw Error('file_too_large');
 const snapshot=parseBalanceSnapshot(JSON.parse(await fs.readFile(snapshotPath,'utf8'))),bytes=await fs.readFile(csvPath),csv=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
 const hash=v=>createHash('sha256').update(v).digest('hex');
 if(hash(balanceSnapshotMaterial(snapshot))!==snapshot.accountsDigest)throw Error('snapshot_changed');
 const report=reconcileBalances(snapshot,csv,total,hash(bytes));
 await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({comparisonWritten:true,rows:report.rows.length,totalMatches:report.totalMatches,issues:report.rows.filter(r=>r.issues.length).length,liveChanges:false}));
}catch{console.error('Vergelijking niet opgeslagen. Controleer bronbestanden, controletotaal en een nieuwe uitvoerbestandsnaam.');process.exitCode=1;}
