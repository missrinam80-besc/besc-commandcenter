import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const org = "11111111-1111-4111-8111-111111111111", discord = "222222222222222222";
function fixture(options: { errorTable?: string; otherRoleOrg?: boolean; deletedRole?: boolean; noUser?: boolean; authStatus?: number; banned?: string } = {}) {
  const filters: unknown[][] = [];
  const data: Record<string, unknown> = {
    profiles: { id: "fixture-user" },
    organization_members: { organization_id: org, role: "volunteer", status: "active", finance_role: "none",
      organization_access_roles: { organization_id: options.otherRoleOrg ? "other" : org,
        deleted_at: options.deletedRole ? "2026-01-01" : null, capabilities: ["manageEvents"] } },
    events: [{ id: "fixture-event", title: "TESTFIXTURE — NIET PUBLICEREN" }],
  };
  const admin = { from: (table: string) => {
    const q: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: data[table], error: options.errorTable === table ? { message: "secret" } : null }).then(resolve) };
    for (const method of ["select", "eq", "is", "order", "range"]) q[method] = (...args: unknown[]) => { filters.push([table, method, ...args]); return q; };
    q.maybeSingle = () => Promise.resolve({ data: data[table], error: options.errorTable === table ? { message: "secret" } : null }); return q;
  }, auth: { admin: { getUserById: async (id: string) => { filters.push(["auth", "getUserById", id]); return {
    data: { user: options.noUser ? null : { identities: [{ provider: "discord", identity_data: { sub: discord } }], banned_until: options.banned } },
    error: options.authStatus ? { status: options.authStatus } : null,
  }; } } } };
  const compiled = { exports: {} as Record<string, unknown> };
  const source = readFileSync(new URL("../src/lib/bot-api-store.ts", import.meta.url), "utf8");
  const overrides: Record<string, unknown> = {
    "server-only": {}, "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/profile-identities": { findIdentity: (identities: { provider: string }[], provider: string) => identities.find(i => i.provider === provider),
      discordIdentityDetails: (identity: { identity_data: { sub: string } } | undefined) => identity ? { userId: identity.identity_data.sub } : null },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: compiled, exports: compiled.exports, require: (key: string) => { if (!(key in overrides)) throw Error(`Unexpected import ${key}`); return overrides[key]; }, Date,
  });
  const store = (compiled.exports.createBotStore as () => {
    findAccount(id: string): Promise<{ verifiedDiscordId: string | null; banned: boolean } | null>;
    findMembership(id: string, org: string): Promise<{ capabilities: string[] | null } | null>;
    listEvents(org: string, offset: number, count: number): Promise<unknown[]>;
  })();
  return { filters, store };
}
test("Adapter verifieert Auth-identiteit na profielzoekopdracht", async () => {
  const f = fixture(); assert.equal((await f.store.findAccount(discord))?.verifiedDiscordId, discord);
  assert.ok(f.filters.some(v => JSON.stringify(v) === JSON.stringify(["profiles", "eq", "discord_user_id", discord])));
  assert.ok(f.filters.some(v => JSON.stringify(v) === JSON.stringify(["auth", "getUserById", "fixture-user"])));
});
test("Events-adapter sluit andere organisaties, verwijderde rijen en privévelden uit", async () => {
  const f = fixture(); await f.store.listEvents(org, 5, 6);
  const has = (row: unknown[]) => f.filters.some(v => JSON.stringify(v) === JSON.stringify(row));
  assert.ok(has(["events", "eq", "organization_id", org])); assert.ok(has(["events", "is", "deleted_at", null]));
  assert.ok(has(["events", "range", 5, 10])); assert.ok(has(["events", "order", "id", { ascending: true }]));
  const selection = f.filters.find(v => v[0] === "events" && v[1] === "select")?.[2];
  assert.equal(selection, "id,title,status,event_type,start_at,start_date,location,is_online");
});
for (const mode of ["same", "other", "deleted"]) test(`Lidmaatschap selecteert de organisatie; maatwerkrol is ${mode}`, async () => {
  const f = fixture({ otherRoleOrg: mode === "other", deletedRole: mode === "deleted" });
  const member = await f.store.findMembership("fixture-user", org);
  assert.equal(JSON.stringify(member?.capabilities), mode === "same" ? '["manageEvents"]' : "null");
  assert.ok(f.filters.some(v => JSON.stringify(v) === JSON.stringify(["organization_members", "eq", "organization_id", org])));
});
test("Auth-verwijdering verschilt van tijdelijke upstreamfout", async () => {
  assert.equal(await fixture({ authStatus: 404 }).store.findAccount(discord), null);
  await assert.rejects(fixture({ authStatus: 500 }).store.findAccount(discord), /store_unavailable/);
  assert.equal(await fixture({ noUser: true }).store.findAccount(discord), null);
});
test("Bans worden actueel gecontroleerd en ongeldige vervaldatums weigeren toegang", async () => {
  for (const banned of ["2099-01-01", "invalid"]) assert.equal((await fixture({ banned }).store.findAccount(discord))?.banned, true);
  assert.equal((await fixture({ banned: "2000-01-01" }).store.findAccount(discord))?.banned, false);
});
test("Geen fallback naar onbeperkte data bij queryfouten", async () => {
  await assert.rejects(fixture({ errorTable: "profiles" }).store.findAccount(discord));
  await assert.rejects(fixture({ errorTable: "organization_members" }).store.findMembership("fixture-user", org));
  await assert.rejects(fixture({ errorTable: "events" }).store.listEvents(org, 0, 6));
});
