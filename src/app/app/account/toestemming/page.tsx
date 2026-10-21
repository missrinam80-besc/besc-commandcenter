import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { F1OwnConsent } from '@/components/f1-own-consent';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <AppShell active="Mijn account"><header className="topbar module-top"><h1>Mijn doelgerichte toestemmingen</h1></header><div className="module-body"><Link href="/app/account">Mijn account</Link><F1OwnConsent query={await searchParams} returnTo="/app/account/toestemming"/></div></AppShell>;}
