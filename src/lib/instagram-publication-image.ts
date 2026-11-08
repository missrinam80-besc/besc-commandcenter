import {createHash} from 'node:crypto';
import sharp from 'sharp';
import type {InstagramJob} from './instagram-publication.ts';

export function instagramImageUrl(url:string,organization:string,sha256:string,trustedOrigin:string){
 const source=new URL(url),origin=new URL(trustedOrigin);
 if(origin.protocol!=='https:'||origin.origin!==trustedOrigin||origin.username||origin.password||source.origin!==trustedOrigin||source.username||source.password||source.search||source.hash
  ||!/^[a-f0-9]{64}$/.test(sha256)||source.pathname!==`/social-publication/${organization}/${sha256}.jpg`)throw Error('instagram_managed_image_required');
 return source.href;
}
// BESC's conservative single-JPEG guard; no conversion or remote redirect.
export async function verifyInstagramImage(job:Pick<InstagramJob,'image_url'|'image_sha256'|'organization_id'>,trustedOrigin:string,request:typeof fetch){
 const url=instagramImageUrl(job.image_url,job.organization_id,job.image_sha256,trustedOrigin);
 const response=await request(url,{redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15_000)});
 if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim()!=='image/jpeg'){await response.body?.cancel();throw Error('instagram_jpeg_required');}
 const reader=response.body?.getReader();if(!reader)throw Error('instagram_image_missing');
 const chunks:Buffer[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000)throw Error('instagram_image_too_large');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 const bytes=Buffer.concat(chunks);
 if(createHash('sha256').update(bytes).digest('hex')!==job.image_sha256)throw Error('instagram_image_changed');
 const info=await sharp(bytes,{limitInputPixels:4_000_000}).metadata();
 if(info.format!=='jpeg'||!info.width||!info.height||info.width<320||info.width>1440||info.width/info.height<0.8||info.width/info.height>1.91||(info.pages??1)!==1)throw Error('instagram_image_dimensions_invalid');
 await sharp(bytes,{limitInputPixels:4_000_000}).raw().toBuffer();
}
