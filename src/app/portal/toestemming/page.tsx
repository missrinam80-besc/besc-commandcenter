import Link from 'next/link';
import { F1OwnConsent } from '@/components/f1-own-consent';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){return <main className="module-body"><h1>Mijn doelgerichte toestemmingen</h1><Link href="/portal">Mijn portaal</Link><F1OwnConsent query={await searchParams} returnTo="/portal/toestemming"/></main>;}
