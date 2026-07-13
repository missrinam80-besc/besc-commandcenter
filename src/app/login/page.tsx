import { KeyRound, Mail } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/configured";
import { registerWithPassword, requestPasswordReset, sendMagicLink, signInWithDiscord, signInWithPassword } from "./actions";

const messages:Record<string,string>={
  inloggegevens:"E-mailadres of wachtwoord is niet correct.",velden:"Vul alle verplichte velden in.",
  "magic-link":"De magic link kon niet worden verstuurd. Wacht minstens 60 seconden en controleer de e-mailinstellingen in Supabase.",
  callback:"De inloglink is ongeldig, verlopen of al gebruikt. Vraag een nieuwe link aan.",discord:"Inloggen via Discord is mislukt.",
  recovery:"De recoverymail kon niet worden verstuurd. Wacht even en probeer opnieuw.","recovery-sessie":"De recoverylink is verlopen of ongeldig. Vraag een nieuwe link aan.",
  "wachtwoord-eisen":"Gebruik een wachtwoord van minstens acht tekens.","wachtwoorden-verschillen":"De twee wachtwoorden zijn niet gelijk.",
  "account-bestaat":"Er bestaat al een account met dit e-mailadres. Gebruik ‘Wachtwoord vergeten’ om een wachtwoord in te stellen.",registratie:"Registreren is mislukt. Controleer de Supabase e-mailinstellingen.",
};

export default async function LoginPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const params=await searchParams;const configured=isSupabaseConfigured();
  return <main className="login-page"><section className="login-brand"><div className="brand-mark">B</div><span>BESC COMMAND CENTER</span><h1>Samen bouwen aan<br/>een sterkere community.</h1><p>De centrale werkplek voor het bestuur, team en vrijwilligers van BESC vzw.</p></section><section className="login-card"><div><span className="eyebrow">WELKOM TERUG</span><h2>Log in op je werkplek</h2><p>Gebruik je bestaande account of log in via Discord.</p></div>
    {!configured&&<div className="demo-notice">Demomodus actief. Configureer Supabase om inloggen te activeren.</div>}
    {params.error&&<div className="error-note">{messages[params.error]||"Inloggen is mislukt."}</div>}
    {params.sent&&<div className="success">De magic link is verstuurd. De link kan maximaal één keer gebruikt worden.</div>}
    {params.recovery&&<div className="success">Controleer je inbox. De recoverylink brengt je naar een scherm om een nieuw wachtwoord in te stellen.</div>}
    {params.registratie&&<div className="success">Je account is aangemaakt. Bevestig je e-mailadres en wacht daarna op goedkeuring door een beheerder.</div>}
    {params.uitgelogd&&<div className="success">Je bent veilig uitgelogd.</div>}
    <form action={signInWithPassword}><label>E-mailadres</label><div className="field"><Mail size={17}/><input name="email" type="email" autoComplete="email" required placeholder="naam@besc.be"/></div><label className="password-label">Wachtwoord</label><div className="field"><KeyRound size={17}/><input name="password" type="password" autoComplete="current-password" required placeholder="Je wachtwoord"/></div><button className="login-submit" disabled={!configured}>Inloggen</button></form>
    <details className="auth-option" id="wachtwoord-vergeten"><summary>Wachtwoord vergeten of nog nooit ingesteld?</summary><form action={requestPasswordReset}><label>E-mailadres</label><div className="magic-row"><input name="email" type="email" required placeholder="naam@besc.be"/><button disabled={!configured}>Recoverymail</button></div></form></details>
    <details className="auth-option"><summary>Inloggen met een magic link</summary><form action={sendMagicLink}><label>E-mailadres</label><div className="magic-row"><input name="email" type="email" required placeholder="naam@besc.be"/><button disabled={!configured}>Magic link</button></div></form></details>
    <div className="or"><span/>of<span/></div><form action={signInWithDiscord}><button className="discord-button" disabled={!configured}>D&nbsp;&nbsp; Doorgaan met Discord</button></form>
    <details className="auth-option register-option" id="registreren"><summary>Nog geen account? Registreren</summary><form action={registerWithPassword}><label>E-mailadres<input name="email" type="email" required autoComplete="email"/></label><label>Wachtwoord<input name="password" type="password" minLength={8} required autoComplete="new-password"/></label><label>Herhaal wachtwoord<input name="confirm_password" type="password" minLength={8} required autoComplete="new-password"/></label><button className="login-submit" disabled={!configured}>Account aanvragen</button></form></details>
  </section></main>;
}
