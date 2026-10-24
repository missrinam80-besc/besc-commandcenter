// Local file preparation only. Does not register a client or change server access.
import {randomBytes,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const arg=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('missing_argument');return process.argv[i+1];};
if(!process.argv.includes('--create'))console.log('Voorbereiding: --create --id <client> --org <uuid> --source <uuid> --broadcaster <id> --expires <UTC> --output-prefix <nieuw-pad>. Maakt alleen lokale private bestanden; registreert niets.');
else try{
 const id=arg('--id'),organizationId=arg('--org'),sourceId=arg('--source'),broadcasterId=arg('--broadcaster'),expiresAt=arg('--expires'),prefix=arg('--output-prefix');
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!/^[a-z0-9-]{3,64}$/.test(id)||!uuid.test(organizationId)||!uuid.test(sourceId)||!/^[1-9]\d{0,19}$/.test(broadcasterId)||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now())throw Error('invalid_arguments');
 const token='bcr_'+id+'.'+randomBytes(32).toString('base64url'),client={id,keyHash:createHash('sha256').update(token).digest('hex'),organizationId,sourceId,broadcasterId,scopes:['campaigns:reference:write'],expiresAt:new Date(expiresAt).toISOString(),revoked:false};
 await writeFile(prefix+'.private.env','BESC_REFERENCE_API_KEY='+token+'\n',{flag:'wx',mode:0o600});
 await writeFile(prefix+'.registry.json',JSON.stringify(client,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Lokale sleutel en registervoorstel voorbereid; geen live toegang toegekend. Bewaar beide bestanden afgeschermd, buiten chat en Git.');
}catch{console.error('Voorbereiding gestopt. Controleer argumenten, vervaldatum en nieuwe bestandsnamen; er is niets op een server gewijzigd.');process.exitCode=1;}
