import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("externe portaaltoegang is per gebruiker en dossier afgeschermd",async()=>{const[migration,hardening]=await Promise.all([source("supabase/migrations/20260803190000_add_external_portal_access.sql"),source("supabase/migrations/20260803191500_harden_external_portal_functions.sql")]);assert.match(migration,/users read own portal access/);assert.match(migration,/user_id = \(select auth\.uid\(\)\)/);assert.match(migration,/where id=p_access_id and user_id=\(select auth\.uid\(\)\)/);assert.match(hardening,/set schema private/);assert.match(hardening,/security invoker/);assert.match(hardening,/revoke all .* from public, anon/);assert.doesNotMatch(migration,/create policy .*portal.* on public\.(campaigns|partners|kpi_records)/i)});

test("portaalgebruikers krijgen een eigen startbestemming",async()=>{const[destination,password,callback,proxy]=await Promise.all([source("src/lib/auth-destination.ts"),source("src/app/login/actions.ts"),source("src/app/auth/callback/route.ts"),source("src/proxy.ts")]);assert.match(destination,/if \(portal\.data\) return "\/portal"/);assert.match(password,/resolveAuthenticatedHome/);assert.match(callback,/resolveAuthenticatedHome/);assert.match(proxy,/resolveAuthenticatedHome/)});

test("beheerders kunnen sponsor- en streamerportalen toekennen en intrekken",async()=>{const[page,actions,portal]=await Promise.all([source("src/app/app/beheer/gebruikers/page.tsx"),source("src/app/app/beheer/actions.ts"),source("src/app/portal/page.tsx")]);assert.match(page,/Sponsorviewer toevoegen/);assert.match(page,/Streamerportaal toevoegen/);assert.match(actions,/savePortalAccess/);assert.match(actions,/revokePortalAccess/);assert.match(portal,/portal_sponsor_dashboard/);assert.match(portal,/portal_streamer_dashboard/)});
