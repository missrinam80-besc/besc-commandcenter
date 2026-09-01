import Image from "next/image";

export default async function NewsletterStatusPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const confirmed = query.resultaat === "bevestigd";
  const unsubscribed = query.resultaat === "uitgeschreven";
  return <main className="public-newsletter-page"><section className="public-newsletter-card">
    <Image src="/besc-logo.png" width={190} height={63} alt="BESC" priority/>
    <span className="eyebrow">BESC-NIEUWSBRIEF</span>
    <h1>{confirmed ? "Inschrijving bevestigd" : unsubscribed ? "Je bent uitgeschreven" : "Link niet geldig"}</h1>
    <p>{confirmed ? "Bedankt. Je ontvangt vanaf nu de BESC-nieuwsbrief." : unsubscribed ? "Je ontvangt geen nieuwe berichten meer via deze mailinglijst." : "Deze bevestigingslink is ongeldig, verlopen of al gebruikt. Vraag indien nodig een nieuwe bevestigingsmail aan."}</p>
  </section></main>;
}
