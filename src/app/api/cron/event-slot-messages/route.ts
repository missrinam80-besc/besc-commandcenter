import {slotCronAuthorized,flushSlotEmails} from "@/lib/event-slot-server";
export const runtime="nodejs";
export const maxDuration=90;
export async function POST(request:Request){const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};if(!slotCronAuthorized(request.headers.get("authorization")))return Response.json({error:"unauthorized"},{status:401,headers});try{return Response.json(await flushSlotEmails(undefined,4),{headers});}catch{return Response.json({error:"slot_message_worker_unavailable"},{status:503,headers});}}
