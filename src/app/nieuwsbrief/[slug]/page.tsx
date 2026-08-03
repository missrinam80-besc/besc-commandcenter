import Image from "next/image";
import { requestNewsletterSubscription } from "../actions";

export default async function PublicNewsletterPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  return <main className="public-newsletter-page"><section className="public-newsletter-card">
    <Image src="/besc-logo.png" width={190} height={63} alt="BESC" priority/>
    <span className="eyebrow">BELGIAN STREAMERS COMMUNITY</span>
    <h1>Blijf op de hoogte</h1>
    <p>Ontvang nieuws over BESC, community-events, streams en initiatieven. Na je aanvraag sturen we eerst een bevestigingsmail.</p>
    {query.aangevraagd && <div className="success">Als dit adres kan worden ingeschreven, ontvang je zo meteen een bevestigingsmail. Controleer ook je spammap.</div>}
    {query.fout && <div className="error-note">Controleer de ingevulde gegevens en bevestig je toestemming.</div>}
    <form action={requestNewsletterSubscription}>
      <input type="hidden" name="list_slug" value={slug}/>
      <label>Naam <span>optioneel</span><input name="display_name" autoComplete="name"/></label>
      <label>E-mailadres<input name="email" type="email" autoComplete="email" required/></label>
      <label className="public-consent"><input type="checkbox" name="consent" value="yes" required/><span>Ik wil de BESC-nieuwsbrief ontvangen en geef toestemming om mijn gegevens hiervoor te verwerken. Ik kan mij altijd kosteloos uitschrijven.</span></label>
      <label className="public-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
      <button>Bevestigingsmail aanvragen</button>
    </form>
    <small>BESC gebruikt je gegevens alleen voor deze mailinglijst. De inschrijving is pas actief nadat je de bevestigingslink hebt geopend.</small>
  </section></main>;
}
