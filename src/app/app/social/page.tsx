import { OperationalModulePage } from "@/components/operational-module-page";
import Link from 'next/link';
import {requireActiveMembership} from '@/lib/auth-context';
import {hasPermission} from '@/lib/permissions';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 if(process.env.BESC_SOCIAL_INBOX_ENABLED==='true'){
  const {membership}=await requireActiveMembership();
  return <>{hasPermission(membership,'manageInbox')&&<nav aria-label="Socialinbox"><Link href="/app/social/inbox">Socialinbox openen</Link></nav>}<OperationalModulePage module="social" searchParams={searchParams}/></>;
 }
 return <OperationalModulePage module="social" searchParams={searchParams}/>;
}
