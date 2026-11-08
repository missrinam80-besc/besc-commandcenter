import {AppShell} from '@/components/app-shell';
import {SocialInboxView} from '@/components/social-inbox-view';
import {requirePermission} from '@/lib/auth-context';
import {inboxRow,inboxDetail} from '@/lib/social-inbox';
import {z} from 'zod';
import Link from 'next/link';
import './social-inbox.css';

export default async function SocialInboxPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 if(process.env.BESC_SOCIAL_INBOX_ENABLED!=='true')return <AppShell active="Social planning"><header className="topbar"><h1>Socialinbox</h1></header><div className="module-body"><p>De socialinbox is nog niet ingeschakeld.</p><Link href="/app/social">Naar social planning</Link></div></AppShell>;
 const {supabase,membership}=await requirePermission('manageInbox');
 const raw=await searchParams;
 const parsed=z.object({status:z.enum(['','open','in_progress','waiting','resolved']).optional(),platform:z.enum(['','facebook','instagram']).optional(),mine:z.enum(['true']).optional(),before:z.uuid().optional(),thread:z.uuid().optional(),messages_before:z.uuid().optional(),events_before:z.string().regex(/^[1-9][0-9]{0,14}$/).optional()}).safeParse(raw);
 const query=parsed.success?parsed.data:{};
 let error=parsed.success?raw.fout:'velden',rows:z.infer<typeof inboxRow>[]=[],detail:z.infer<typeof inboxDetail>|null=null,members:{id:string;name:string}[]=[];
 const rpc=async(action:string,thread:string|null=null,data:Record<string,unknown>={})=>{const answer=await supabase.rpc('social_inbox_owner',{p_org:membership.organization_id,p_action:action,p_thread:thread,p_data:data});if(answer.error)throw Error('social_inbox_unavailable');return answer.data;};
 try{
  rows=z.array(inboxRow).max(26).parse(await rpc('list',null,query));
  members=z.array(z.object({id:z.uuid(),name:z.string()})).parse(await rpc('members'));
  if(query.thread)detail=inboxDetail.parse(await rpc('read',query.thread,query));
 }catch{error='controle';rows=[];detail=null;members=[];}
 return <AppShell active="Social planning"><SocialInboxView rows={rows} detail={detail} members={members} filters={query} error={error} success={raw.succes==='opgeslagen'&&!error}/></AppShell>;
}
