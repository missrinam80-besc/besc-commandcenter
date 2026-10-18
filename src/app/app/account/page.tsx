import Link from "next/link";
import Image from "next/image";
import "./twitch-identity.css";
import {
  Bell, CheckCircle2, ExternalLink, KeyRound, Link2, Mail, MapPin,
  Monitor, Moon, ShieldCheck, Sun, Unlink, UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireActiveMembership } from "@/lib/auth-context";
import { discordIdentityDetails, findIdentity, twitchIdentityDetails } from "@/lib/profile-identities";
import { personalTwitchLinkEnabled } from "@/lib/personal-twitch-link";
import { financeRoleLabels, organizationRoleLabels, type FinanceRole, type OrganizationRole } from "@/lib/permissions";
import {
  linkDiscordIdentity,
  linkTwitchIdentity,
  removeProfileAvatar,
  requestAccountPasswordLink,
  saveProfile,
  saveThemePreference,
  unlinkDiscordIdentity,
  unlinkTwitchIdentity,
  updateAccountEmail,
  updateAccountPassword,
  uploadProfileAvatar,
  useDiscordProfile,
} from "./actions";

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
  pronouns: string | null;
  bio: string | null;
  location: string | null;
  preferred_language: string;
  timezone: string;
  website_url: string | null;
  discord_user_id: string | null;
  discord_username: string | null;
  discord_avatar_url: string | null;
  theme_preference: "system" | "light" | "dark";
};

const successMessages: Record<string, string> = {
  profiel: "Je profielgegevens zijn opgeslagen.",
  "email-verstuurd": "Controleer zowel je huidige als je nieuwe mailbox om de e-mailwijziging te bevestigen.",
  "email-bevestigd": "Je nieuwe e-mailadres is bevestigd.",
  wachtwoord: "Je wachtwoord is gewijzigd.",
  discord: "Je Discord-account is gekoppeld.",
  "discord-ontkoppeld": "Je Discord-account is ontkoppeld.",
  "discord-profiel": "Je Discord-naam en profielfoto zijn overgenomen.",
  twitch: "Je Twitch-account is gekoppeld aan je bestaande BESC-account.",
  "twitch-ontkoppeld": "Je Twitch-account is ontkoppeld. Je BESC-account en saldo blijven behouden.",
  avatar: "Je profielfoto is aangepast.",
  thema: "Je weergavevoorkeur is opgeslagen.",
  "avatar-verwijderd": "Je profielfoto is verwijderd.",
  "wachtwoord-link": "Controleer je mailbox. Via de beveiligde link kun je een eerste of nieuw wachtwoord instellen.",
};

const errorMessages: Record<string, string> = {
  "profiel-velden": "Controleer de ingevulde profielgegevens.",
  "profiel-opslaan": "Je profiel kon niet worden opgeslagen.",
  "email-ongeldig": "Vul een geldig e-mailadres in.",
  "email-ongewijzigd": "Dit is al je huidige e-mailadres.",
  "email-wijzigen": "De e-mailwijziging kon niet worden gestart.",
  "email-limiet": "De mailserver heeft tijdelijk te veel beveiligingsmails verstuurd. Wacht even en probeer later opnieuw; je account is niet gewijzigd.",
  "email-bevestigen": "De bevestigingslink is ongeldig, verlopen of al gebruikt. Vraag de e-mailwijziging opnieuw aan.",
  "wachtwoord-eisen": "Gebruik een wachtwoord van minstens acht tekens.",
  "wachtwoorden-verschillen": "De twee wachtwoorden zijn niet gelijk.",
  "wachtwoord-wijzigen": "Je wachtwoord kon niet worden gewijzigd.",
  "wachtwoord-link": "De beveiligde wachtwoordlink kon niet worden verstuurd.",
  "wachtwoord-geen-email": "Koppel eerst een e-mailadres aan je account.",
  "avatar-bestand": "Kies een JPG-, PNG- of WebP-afbeelding van maximaal 5 MB.",
  "avatar-upload": "De profielfoto kon niet worden geüpload.",
  "avatar-opslaan": "De profielfoto kon niet aan je profiel worden gekoppeld.",
  "discord-link": "Discord koppelen kon niet worden gestart. Controleer of handmatig koppelen in Supabase Auth is ingeschakeld.",
  "discord-niet-gekoppeld": "Er is geen gekoppeld Discord-account gevonden.",
  "discord-ontkoppelen": "Discord kon niet worden ontkoppeld.",
  "identiteiten-ophalen": "Je gekoppelde inlogmethoden konden niet worden opgehaald.",
  "laatste-inlogmethode": "Je laatste inlogmethode kan niet worden verwijderd. Voeg eerst e-mail/wachtwoord toe.",
  "discord-profiel": "De Discord-profielgegevens konden niet worden overgenomen.",
  "twitch-uitgeschakeld": "Persoonlijke Twitchkoppeling is nog niet beschikbaar.",
  "twitch-configuratie": "Twitch koppelen is nog niet geconfigureerd. Neem contact op met een beheerder.",
  "twitch-link": "Twitch koppelen is niet afgerond. Start opnieuw vanuit Mijn account. Is Twitch al aan een ander BESC-account gekoppeld, laat die koppeling dan eerst controleren.",
  "twitch-al-gekoppeld": "Er is al een Twitch-account gekoppeld. Ontkoppel dat eerst als je wilt wisselen.",
  "twitch-geannuleerd": "Twitch koppelen is geannuleerd of geweigerd. Je bestaande BESC-account blijft behouden.",
  "twitch-niet-gekoppeld": "Er is geen gekoppeld Twitch-account gevonden.",
  "twitch-ontkoppelen": "Twitch kon niet worden ontkoppeld. Je bestaande koppeling is niet als verwijderd bevestigd.",
  thema: "Je weergavevoorkeur kon niet worden opgeslagen.",
};

const languages = { nl: "Nederlands", fr: "Français", en: "English" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, user, membership } = await requireActiveMembership();
  const [{ data: profileData }, { data: memberData }, identitiesResult] = await Promise.all([
    supabase.from("profiles").select("display_name,avatar_url,first_name,last_name,pronouns,bio,location,preferred_language,timezone,website_url,discord_user_id,discord_username,discord_avatar_url,theme_preference").eq("id", user.id).maybeSingle(),
    supabase.from("organization_members").select("role,finance_role,status,joined_at").eq("organization_id", membership.organization_id).eq("user_id", user.id).maybeSingle(),
    supabase.auth.getUserIdentities(),
  ]);
  const profile = (profileData ?? {
    display_name: null,
    avatar_url: null,
    first_name: null,
    last_name: null,
    pronouns: null,
    bio: null,
    location: null,
    preferred_language: "nl",
    timezone: "Europe/Brussels",
    website_url: null,
    discord_user_id: null,
    discord_username: null,
    discord_avatar_url: null,
    theme_preference: "system",
  }) as Profile;
  const identities = identitiesResult.data?.identities ?? user.identities ?? [];
  const discordIdentity = findIdentity(identities, "discord");
  const discord = discordIdentityDetails(discordIdentity);
  const twitchIdentity = identitiesResult.error ? null : findIdentity(identitiesResult.data?.identities, "twitch");
  const twitch = twitchIdentityDetails(twitchIdentity);
  const twitchLinkEnabled = personalTwitchLinkEnabled();
  const hasEmailIdentity = Boolean(findIdentity(identities, "email"));
  const role = (memberData?.role ?? membership.role) as OrganizationRole;
  const financeRole = (memberData?.finance_role ?? membership.finance_role) as FinanceRole;
  const completenessValues = [
    profile.display_name, profile.first_name, profile.last_name, profile.bio,
    profile.location, profile.preferred_language, profile.timezone, discord,
  ];
  const completeness = Math.round((completenessValues.filter(Boolean).length / completenessValues.length) * 100);
  const name = profile.display_name || user.email?.split("@")[0] || "Gebruiker";
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <AppShell active="Account" name={name}>
      <header className="topbar module-top">
        <div><p>PERSOONLIJKE INSTELLINGEN</p><h1>Mijn account</h1></div>
        <span className="account-security-badge"><ShieldCheck size={16}/>Beveiligde accountomgeving</span>
      </header>
      <div className="module-body account-module">
        <p className="lead">Beheer je persoonlijke profiel, inloggegevens, voorkeuren en gekoppelde accounts.</p>
        {query.succes && <div className="success">{successMessages[query.succes] || "De wijziging is opgeslagen."}</div>}
        {query.fout && <div className="error-note">{errorMessages[query.fout] || "De wijziging is mislukt."}</div>}

        <section className="account-hero">
          <div className="account-avatar">
            {profile.avatar_url
              ? <Image src={profile.avatar_url} alt={`Profielfoto van ${name}`} width={68} height={68}/>
              : initials}
          </div>
          <div>
            <span className="eyebrow">BESC-PROFIEL</span>
            <h2>{name}</h2>
            <p>{user.email || "Geen e-mailadres"}{profile.location ? ` · ${profile.location}` : ""}</p>
            <div className="account-role-tags">
              <span>{organizationRoleLabels[role]}</span>
              {financeRole !== "none" && <span>{financeRoleLabels[financeRole]}</span>}
              <span>{memberData?.status === "active" ? "Actief account" : memberData?.status || "Actief"}</span>
            </div>
          </div>
          <div className="profile-completeness">
            <strong>{completeness}%</strong><span>profiel ingevuld</span>
            <div><i style={{ width: `${completeness}%` }}/></div>
          </div>
        </section>

        <div className="account-grid">
          <section className="form-card account-profile-card">
            <div className="form-heading"><div><span className="eyebrow">PROFIEL</span><h2>Persoonlijke gegevens</h2><p>Deze informatie helpt het BESC-team om vlot samen te werken.</p></div><UserRound/></div>
            <div className="avatar-editor">
              <div className="avatar-preview">
                {profile.avatar_url
                  ? <Image src={profile.avatar_url} alt="" width={64} height={64}/>
                  : initials}
              </div>
              <div>
                <strong>Profielfoto</strong>
                <p>Upload een vierkante JPG, PNG of WebP van maximaal 5 MB.</p>
                <div className="avatar-actions">
                  <form action={uploadProfileAvatar}>
                    <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required/>
                    <button>Foto uploaden</button>
                  </form>
                  {profile.avatar_url && <form action={removeProfileAvatar}><button className="danger-outline">Foto verwijderen</button></form>}
                </div>
              </div>
            </div>
            <form action={saveProfile}>
              <div className="form-row">
                <label>Weergavenaam<input name="display_name" required minLength={2} defaultValue={profile.display_name ?? ""}/></label>
                <label>Voornaam<input name="first_name" defaultValue={profile.first_name ?? ""}/></label>
                <label>Familienaam<input name="last_name" defaultValue={profile.last_name ?? ""}/></label>
                <label>Voornaamwoorden<input name="pronouns" defaultValue={profile.pronouns ?? ""} placeholder="Bijv. zij/haar"/></label>
              </div>
              <label>Over mij<textarea name="bio" rows={5} maxLength={1200} defaultValue={profile.bio ?? ""} placeholder="Vertel kort wat je binnen BESC doet of graag wil bijdragen."/></label>
              <div className="form-row">
                <label><MapPin size={14}/>Locatie<input name="location" defaultValue={profile.location ?? ""} placeholder="Bijv. Antwerpen"/></label>
                <label>Voorkeurstaal<select name="preferred_language" defaultValue={profile.preferred_language || "nl"}>{Object.entries(languages).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>Tijdzone<input name="timezone" defaultValue={profile.timezone || "Europe/Brussels"}/></label>
                <label>Website of portfolio<input name="website_url" type="url" defaultValue={profile.website_url ?? ""} placeholder="https://"/></label>
              </div>
              <div className="form-actions"><button className="primary">Profiel opslaan</button></div>
            </form>
          </section>

          <aside className="account-side">
            <section className="form-card identity-card discord-identity">
              <div className="identity-heading"><div className="identity-logo">D</div><div><span>GEKOPPELD ACCOUNT</span><h2>Discord</h2></div></div>
              {discord ? (
                <>
                  <div className="identity-status connected"><CheckCircle2 size={16}/><div><strong>{discord.username || "Discord-account"}</strong><span>Discord is gekoppeld als inlogmethode.</span></div></div>
                  <div className="identity-actions">
                    <form action={useDiscordProfile}><button><UserRound size={15}/>Profielgegevens overnemen</button></form>
                    <form action={unlinkDiscordIdentity}><button className="danger-outline"><Unlink size={15}/>Ontkoppelen</button></form>
                  </div>
                </>
              ) : (
                <>
                  <p>Koppel Discord zodat je ook daarmee kunt inloggen en je identiteit herkenbaar is voor het team.</p>
                  <form action={linkDiscordIdentity}><button className="discord-connect"><Link2 size={16}/>Discord koppelen</button></form>
                </>
              )}
            </section>

            <section className="form-card identity-card twitch-identity">
              <div className="identity-heading"><div className="identity-logo">T</div><div><span>GEKOPPELD ACCOUNT</span><h2>Twitch</h2></div></div>
              {identitiesResult.error ? <p>Je Twitchkoppeling kon niet worden gecontroleerd. Vernieuw de pagina om het opnieuw te proberen.</p> : twitch ? (
                <>
                  <div className="identity-status connected"><CheckCircle2 size={16}/><div><strong>{twitch.username || "Twitch-account"}</strong><span>Gekoppeld aan dit BESC-account.</span></div></div>
                  <p>Twitch-ID: {twitch.userId}. Deze koppeling wijzigt je saldo niet en activeert geen verdienregels.</p>
                  <div className="identity-actions"><form action={unlinkTwitchIdentity}><button className="danger-outline"><Unlink size={15}/>Ontkoppelen</button></form></div>
                </>
              ) : twitchIdentity ? (
                <>
                  <p>Er is een Twitchkoppeling gevonden, maar de account-ID kon niet worden bevestigd. Deze koppeling kan niet worden gebruikt voor beloningen.</p>
                  <div className="identity-actions"><form action={unlinkTwitchIdentity}><button className="danger-outline"><Unlink size={15}/>Ontkoppelen</button></form></div>
                </>
              ) : twitchLinkEnabled ? (
                <>
                  <p>Koppel je persoonlijke Twitch-account aan je bestaande BESC-account. Je kiest en bevestigt het account bij Twitch. Dit activeert geen verdienregels.</p>
                  <div className="identity-actions"><form action={linkTwitchIdentity}><button><Link2 size={16}/>Twitch koppelen</button></form></div>
                </>
              ) : <p>Persoonlijke Twitchkoppeling is nog niet beschikbaar.</p>}
            </section>

            <section className="form-card account-summary-card">
              <h2>Accountoverzicht</h2>
              <dl>
                <div><dt>E-mail</dt><dd>{user.email || "Niet ingesteld"}</dd></div>
                <div><dt>E-mail bevestigd</dt><dd>{user.email_confirmed_at ? "Ja" : "Nog niet"}</dd></div>
                <div><dt>Inlogmethoden</dt><dd>{[hasEmailIdentity && "E-mail", discord && "Discord", twitch && "Twitch"].filter(Boolean).join(", ") || "Onbekend"}</dd></div>
                <div><dt>Lid sinds</dt><dd>{memberData?.joined_at ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "long" }).format(new Date(memberData.joined_at)) : "Onbekend"}</dd></div>
              </dl>
            </section>

            <Link className="account-preference-link" href="/app/meldingen?instellingen=1">
              <Bell size={19}/><div><strong>Meldingsvoorkeuren</strong><span>Bepaal welke opvolging je ontvangt.</span></div><ExternalLink size={15}/>
            </Link>
            <section className="form-card theme-preference-card">
              <div><strong>Weergave</strong><span>Kies licht, donker of volg je toestel.</span></div>
              <form action={saveThemePreference}>
                <label><input type="radio" name="theme_preference" value="system" defaultChecked={profile.theme_preference === "system"}/><Monitor size={15}/><span>Systeem</span></label>
                <label><input type="radio" name="theme_preference" value="light" defaultChecked={profile.theme_preference === "light"}/><Sun size={15}/><span>Licht</span></label>
                <label><input type="radio" name="theme_preference" value="dark" defaultChecked={profile.theme_preference === "dark"}/><Moon size={15}/><span>Donker</span></label>
                <button>Toepassen</button>
              </form>
            </section>
          </aside>
        </div>

        <section className="account-security-grid">
          <article className="form-card">
            <div className="form-heading"><div><span className="eyebrow">INLOGGEGEVENS</span><h2>E-mailadres wijzigen</h2><p>Je ontvangt bevestigingsmails voordat het nieuwe adres actief wordt.</p></div><Mail/></div>
            <form action={updateAccountEmail}>
              <label>Nieuw e-mailadres<input name="email" type="email" required autoComplete="email" defaultValue={user.email ?? ""}/></label>
              <div className="form-actions"><button>E-mailwijziging aanvragen</button></div>
            </form>
          </article>
          <article className="form-card">
            <div className="form-heading"><div><span className="eyebrow">BEVEILIGING</span><h2>{hasEmailIdentity ? "Wachtwoord wijzigen" : "Wachtwoord instellen"}</h2><p>Ook met een Discord- of magic-linkaccount kun je zonder oud wachtwoord een wachtwoord toevoegen.</p></div><KeyRound/></div>
            <form action={updateAccountPassword}>
              <div className="form-row">
                <label>Nieuw wachtwoord<input name="password" type="password" required minLength={8} autoComplete="new-password"/></label>
                <label>Herhaal wachtwoord<input name="confirm_password" type="password" required minLength={8} autoComplete="new-password"/></label>
              </div>
              <div className="form-actions"><button>{hasEmailIdentity ? "Wachtwoord wijzigen" : "Wachtwoord instellen"}</button></div>
            </form>
            <div className="password-link-option">
              <span>Geen oud wachtwoord, of lukt rechtstreeks instellen niet?</span>
              <form action={requestAccountPasswordLink}><button>Stuur beveiligde instellink</button></form>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
