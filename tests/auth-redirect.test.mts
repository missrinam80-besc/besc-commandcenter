import assert from "node:assert/strict";
import test from "node:test";
import { internalAuthDestination } from "../src/lib/auth-redirect.ts";

test("Bestaande interne login-, Discord-, herstel- en e-mailbestemmingen blijven behouden", () => {
  for (const path of ["/app", "/app/account?succes=discord", "/wachtwoord-instellen", "/app/account?succes=email-bevestigd", "/app/account#profiel"]) {
    assert.equal(internalAuthDestination(path, "/app"), path);
  }
});

test("Algemene auth-callback weigert externe redirects, ook na URL-normalisatie", () => {
  for (const value of [null, "", "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\t/evil.invalid", "/\n/evil.invalid", "\\\\evil.invalid", "javascript:alert(1)"]) {
    assert.equal(internalAuthDestination(value, "/wachtwoord-instellen"), "/wachtwoord-instellen", value ?? "null");
  }
});
