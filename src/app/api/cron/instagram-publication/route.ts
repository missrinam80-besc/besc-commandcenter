import {dispatchInstagramPublications} from '@/lib/instagram-publication-runtime';
export const maxDuration=600;
export async function POST(request:Request){
 const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
 if(process.env.BESC_INSTAGRAM_PUBLICATION_ENABLED!=='true')return reply({ok:false,error:'instagram_publication_disabled'},503);
 if(!process.env.CRON_SECRET)return reply({ok:false,error:'cron_not_configured'},503);
 if(request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return reply({ok:false,error:'unauthorized'},401);
 try{const result=await dispatchInstagramPublications();return reply({ok:result.attention===0,...result},result.attention?503:200);}
 catch{return reply({ok:false,error:'instagram_publication_not_confirmed'},503);}
}
