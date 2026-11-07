import {creatorYouTubeRoute} from '@/lib/creator-youtube-runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return creatorYouTubeRoute(request,'callback');}
