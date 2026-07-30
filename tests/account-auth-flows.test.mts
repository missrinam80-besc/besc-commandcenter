import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const accountPage = readFileSync("src/app/app/account/page.tsx", "utf8");
const accountActions = readFileSync("src/app/app/account/actions.ts", "utf8");
const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
const avatarMigration = readFileSync("supabase/migrations/20260730125218_add_profile_avatar_storage.sql", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

test("auth callback ondersteunt PKCE en token-hash bevestigingslinks", () => {
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /verifyOtp\(\{ token_hash: tokenHash!, type: type! \}\)/);
  assert.match(callback, /"email_change"/);
  assert.match(callback, /"recovery"/);
  assert.ok(existsSync("src/app/auth/confirm/route.ts"));
});

test("OAuth- en magic-linkgebruikers kunnen zonder oud wachtwoord een wachtwoord instellen", () => {
  assert.match(accountActions, /auth\.updateUser\(\{ password: parsed\.data\.password \}\)/);
  assert.match(accountActions, /resetPasswordForEmail\(user\.email/);
  assert.match(accountActions, /requestAccountPasswordLink/);
  assert.doesNotMatch(accountActions, /current_password|old_password/);
  assert.match(accountPage, /Geen oud wachtwoord/);
  assert.match(accountPage, /Stuur beveiligde instellink/);
});

test("profielfoto's worden gevalideerd, opgeslagen en in het profiel getoond", () => {
  assert.match(accountActions, /image\/jpeg/);
  assert.match(accountActions, /image\/png/);
  assert.match(accountActions, /image\/webp/);
  assert.match(accountActions, /5 \* 1024 \* 1024/);
  assert.match(accountActions, /\.from\("profile-avatars"\)/);
  assert.match(accountActions, /avatar_url: data\.publicUrl/);
  assert.match(accountPage, /uploadProfileAvatar/);
  assert.match(accountPage, /removeProfileAvatar/);
  assert.match(accountPage, /<Image src=\{profile\.avatar_url\}/);
  assert.match(nextConfig, /bodySizeLimit: "6mb"/);
});

test("avataropslag beperkt mutaties tot de eigen gebruikersmap", () => {
  assert.match(avatarMigration, /'profile-avatars'/);
  assert.match(avatarMigration, /true,\s+5242880/);
  assert.match(avatarMigration, /for insert to authenticated/);
  assert.match(avatarMigration, /for update to authenticated/);
  assert.match(avatarMigration, /for delete to authenticated/);
  assert.match(avatarMigration, /storage\.foldername\(name\)/);
  assert.match(avatarMigration, /auth\.uid\(\)/);
});
