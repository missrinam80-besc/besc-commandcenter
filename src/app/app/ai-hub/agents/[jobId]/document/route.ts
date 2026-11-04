import {loadAgentDocument} from '@/lib/agent-document-store';

export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{jobId:string}>}){
  try{
    const {artifact,stale}=await loadAgentDocument((await params).jobId);
    if(stale)return new Response('De bron is gewijzigd. Beoordeel eerst de actuele dossiergegevens.',{status:409,headers:{'Cache-Control':'no-store'}});
    return new Response(new Uint8Array(artifact.bytes),{headers:{
      'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':`attachment; filename="${artifact.filename}"`,
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    }});
  }catch{return new Response('Dit conceptdocument is niet beschikbaar. Controleer je toegang en de opdracht.',{status:403,headers:{'Cache-Control':'no-store'}});}
}
