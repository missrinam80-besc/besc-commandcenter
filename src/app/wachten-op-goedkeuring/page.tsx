import Image from "next/image";
import { signOut } from "@/app/auth/actions";

export default function PendingPage() {
  return (
    <main className="pending-page">
      <Image className="pending-logo" src="/besc-logo.png" width={875} height={286} priority alt="BESC" />
      <span className="eyebrow">TOEGANGSAANVRAAG ONTVANGEN</span>
      <h1>Je account wacht op goedkeuring.</h1>
      <p>Een beheerder van BESC moet je rol en toegang nog bevestigen. Daarna kun je het Command Center gebruiken.</p>
      <form action={signOut}>
        <button className="primary" type="submit">Uitloggen en terug naar inloggen</button>
      </form>
    </main>
  );
}
