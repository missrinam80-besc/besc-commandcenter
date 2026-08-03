import Image from "next/image";
import { requestNewsletterUnsubscription } from "../../actions";

export default async function PublicUnsubscribePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  return <main className="public-newsletter-page"><section className="public-newsletter-card">
    <Image src="/besc-logo.png" width={190} height={63} alt="BESC" priority/>
    <span className="eyebrow">BESC-NIEUWSBRIEF</span><h1>Uitschrijven</h1>
    <p>Vul het e-mailadres in waarop je de nieuwsbrief ontvangt. We sturen een eenmalige bevestigingslink.</p>
    {query.aangevraagd && <div className="success">Als dit adres op de lijst staat, ontvang je een bevestigingsmail.</div>}
    {query.fout && <div className="error-note">Controleer het ingevulde e-mailadres.</div>}
    <form action={requestNewsletterUnsubscription}>
      <input type="hidden" name="list_slug" value={slug}/>
      <label>E-mailadres<input name="email" type="email" autoComplete="email" required/></label>
      <label className="public-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
      <button>Uitschrijfmail aanvragen</button>
    </form>
  </section></main>;
}
