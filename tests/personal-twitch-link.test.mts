import assert from "node:assert/strict";
import test from "node:test";
import type { UserIdentity } from "@supabase/supabase-js";
import { twitchIdentityDetails } from "../src/lib/profile-identities.ts";
import { completePersonalTwitchLink, personalTwitchOrigin, removePersonalTwitchLink, type TwitchCallbackPorts } from "../src/lib/personal-twitch-link.ts";

function identity(provider = "twitch", data: Record<string, unknown> = { sub: "123456789", provider_id: "123456789", preferred_username: "testfixture" }): UserIdentity {
  return { id: "not-a-provider-id", identity_id: "test-identity", user_id: "member-a", provider, identity_data: data, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-01-01T00:00:00Z" };
}

test("Twitchidentiteit gebruikt alleen de bevestigde numerieke provider-ID, niet naam of identity UUID", () => {
  assert.deepEqual(twitchIdentityDetails(identity()), { userId: "123456789", username: "testfixture" });
  assert.equal(twitchIdentityDetails(identity("twitch", { sub: "123456789", preferred_username: "renamed" }))?.userId, "123456789");
  assert.equal(twitchIdentityDetails(identity("twitch", { provider_id: "987654321" }))?.userId, "987654321");
});
for (const [name, value] of Object.entries({
  missing: {}, usernameOnly: { user_name: "123456789" }, uuid: { sub: "a1b2-c3d4" },
  numeric: { sub: 123456789 }, zero: { sub: "0" }, padded: { sub: " 123456789" },
  conflicting: { sub: "123456789", provider_id: "987654321" }, malformedSecond: { sub: "123456789", provider_id: "name" },
})) test(`Niet-bevestigde Twitch-ID wordt geweigerd: ${name}`, () => {
  assert.equal(twitchIdentityDetails(identity("twitch", value)), null);
});
test("Een Discordidentiteit en een ontbrekende identiteit zijn geen Twitchbewijs", () => {
  assert.equal(twitchIdentityDetails(identity("discord")), null);
  assert.equal(twitchIdentityDetails(null), null);
});

test("OAuth-origin is exact geconfigureerd; geen hostheader, credentials, externe path of onveilige productie-HTTP", () => {
  assert.equal(personalTwitchOrigin("https://cc.example.invalid/"), "https://cc.example.invalid");
  assert.equal(personalTwitchOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const input of [undefined, "", "//evil.invalid", "http://cc.example.invalid", "https://u:p@cc.example.invalid", "https://cc.example.invalid/path", "https://cc.example.invalid/?next=evil", "https://cc.example.invalid/#x"]) {
    assert.equal(personalTwitchOrigin(input), null, input);
  }
});

function fixture() {
  let reads = 0;
  const calls: string[] = [];
  const ports: TwitchCallbackPorts = {
    async getUser() { reads++; calls.push("user"); return { user: { id: "member-a", identities: [identity("email"), identity()] }, error: null }; },
    async exchangeCode(code) { calls.push(`exchange:${code}`); return { error: null }; },
    async isActiveMember(userId) { calls.push(`member:${userId}`); return true; },
    async clearLocalSession() { calls.push("clear-local-session"); },
  };
  return { ports, calls, reads: () => reads, run: (query = "code=fixture-code", enabled = true) => completePersonalTwitchLink(new URLSearchParams(query), enabled, ports) };
}

test("Koppeling blijft bij dezelfde BESC-gebruiker met actueel lidmaatschap, ook met externe next-parameter", async () => {
  const f = fixture();
  assert.equal(await f.run("code=fixture-code&next=https://evil.invalid"), "/app/account?succes=twitch");
  assert.deepEqual(f.calls, ["user", "member:member-a", "exchange:fixture-code", "user", "member:member-a"]);
});
test("Standaard uit blokkeert voordat Auth of database wordt aangeroepen", async () => {
  const f = fixture();
  assert.equal(await f.run(undefined, false), "/app/account?fout=twitch-uitgeschakeld");
  assert.deepEqual(f.calls, []);
});
for (const query of ["", "code=", "code=a&code=b", `code=${"x".repeat(2049)}`]) test(`Ongeldige callbackcode doet geen Auth-mutatie: ${query.slice(0, 25)}`, async () => {
  const f = fixture(); assert.equal(await f.run(query), "/app/account?fout=twitch-link"); assert.deepEqual(f.calls, []);
});
test("Weigering van provider wordt veilig gemeld zonder foutinhoud te reflecteren", async () => {
  const f = fixture();
  assert.equal(await f.run("error=access_denied&error_description=secret"), "/app/account?fout=twitch-geannuleerd");
  assert.deepEqual(f.calls, []);
});
test("Verlopen of ontbrekende BESC-sessie wordt niet omgezet in een nieuwe login", async () => {
  const f = fixture(); f.ports.getUser = async () => ({ user: null, error: new Error("expired") });
  assert.equal(await f.run(), "/login?error=twitch-sessie"); assert.deepEqual(f.calls, []);
});
test("Inactief lidmaatschap blokkeert de OAuth-codewisseling", async () => {
  const f = fixture(); f.ports.isActiveMember = async () => false;
  assert.equal(await f.run(), "/wachten-op-goedkeuring"); assert.equal(f.calls.some((c) => c.startsWith("exchange")), false);
});
test("Ongeldige, verlopen of hergebruikte PKCE-code geeft geen succesvolle koppeling", async () => {
  const f = fixture(); f.ports.exchangeCode = async () => ({ error: new Error("used-code") });
  assert.equal(await f.run(), "/app/account?fout=twitch-link"); assert.equal(f.reads(), 1);
});
test("Gewijzigde BESC-sessie wordt geweigerd en lokaal afgemeld", async () => {
  const f = fixture(); let reads = 0;
  f.ports.getUser = async () => ({ user: { id: ++reads === 1 ? "member-a" : "member-b", identities: [identity()] }, error: null });
  assert.equal(await f.run(), "/login?error=twitch-sessie"); assert.equal(f.calls.at(-1), "clear-local-session");
});
test("Auth-uitval na de codewisseling wordt eveneens lokaal afgemeld", async () => {
  const f = fixture(); let reads = 0;
  f.ports.getUser = async () => ++reads === 1 ? { user: { id: "member-a" }, error: null } : { user: null, error: new Error("unavailable") };
  assert.equal(await f.run(), "/login?error=twitch-sessie"); assert.equal(f.calls.at(-1), "clear-local-session");
});
test("Lidmaatschap dat tijdens OAuth vervalt wordt opnieuw geweigerd", async () => {
  const f = fixture(); let checks = 0; f.ports.isActiveMember = async () => ++checks === 1;
  assert.equal(await f.run(), "/wachten-op-goedkeuring"); assert.equal(checks, 2);
});
test("Codewisseling zonder actuele Twitchidentiteit of met ongeldige ID is geen succes", async () => {
  for (const identities of [[identity("email")], [identity("twitch", { sub: "name" })]]) {
    const f = fixture(); f.ports.getUser = async () => ({ user: { id: "member-a", identities }, error: null });
    assert.equal(await f.run(), "/app/account?fout=twitch-link");
  }
});
test("Transportfouten worden niet met tokens of providerinhoud gereflecteerd", async () => {
  const f = fixture(); f.ports.exchangeCode = async () => { throw new Error("fixture-secret"); };
  assert.equal(await f.run(), "/app/account?fout=twitch-link");
});

test("Ontkoppelen gebruikt uitsluitend de actuele eigen Twitchidentiteit en behoudt andere methoden", async () => {
  const twitch = identity(); const removed: UserIdentity[] = [];
  assert.equal(await removePersonalTwitchLink({
    async getIdentities() { return { identities: [identity("email"), identity("discord"), twitch], error: null }; },
    async unlink(value) { removed.push(value); return { error: null }; },
  }), "/app/account?succes=twitch-ontkoppeld");
  assert.deepEqual(removed, [twitch]);
});
for (const [name, identities, error, expected] of [
  ["laatste methode", [identity()], null, "laatste-inlogmethode"],
  ["niet gekoppeld", [identity("email")], null, "twitch-niet-gekoppeld"],
  ["Auth onbeschikbaar", [identity(), identity("email")], new Error("down"), "identiteiten-ophalen"],
] as const) test(`Ontkoppelen weigert ${name} zonder mutatie`, async () => {
  let calls = 0;
  assert.equal(await removePersonalTwitchLink({
    async getIdentities() { return { identities: [...identities], error }; },
    async unlink() { calls++; return { error: null }; },
  }), `/app/account?fout=${expected}`);
  assert.equal(calls, 0);
});
test("Geweigerde of mislukte Auth-ontkoppeling wordt nooit als voltooid gemeld", async () => {
  assert.equal(await removePersonalTwitchLink({
    async getIdentities() { return { identities: [identity(), identity("email")], error: null }; },
    async unlink() { return { error: new Error("not allowed") }; },
  }), "/app/account?fout=twitch-ontkoppelen");
});
