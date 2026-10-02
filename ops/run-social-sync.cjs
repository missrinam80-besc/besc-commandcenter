// Executed inside the web container: secrets never leave its environment.
async function main() {
  const mode = process.argv[2];
  if (mode && !["--dry-run", "--check-auth"].includes(mode)) throw new Error("Onbekende testoptie.");
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET ontbreekt in de webcontainer. Stel deze in en herstart web.");
  const url = new URL("/api/cron/social-sync", `http://127.0.0.1:${process.env.PORT || 3000}`);
  if (mode === "--dry-run") url.searchParams.set("dry_run", "1");
  for (let batch = 0; batch < 20; batch += 1) {
    const response = await fetch(url, {
      headers: mode === "--check-auth" ? {} : { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(240_000), redirect: "error",
    });
    if (mode === "--check-auth") {
      if (response.status !== 401) throw new Error(`Beveiligingstest mislukt: HTTP ${response.status}, verwacht 401.`);
      console.log("Beveiliging OK: zonder Bearer-token wordt de route geweigerd (401).");
      return;
    }
    const result = await response.json();
    // Only log known counters, never arbitrary server responses or credentials.
    console.log(JSON.stringify(Object.fromEntries(
      ["ok", "dryRun", "considered", "due", "processed", "succeeded", "partial", "failed", "skipped", "remaining"]
        .filter((key) => key in result).map((key) => [key, result[key]]),
    )));
    if (!response.ok || result.ok !== true) throw new Error(`Synchronisatie niet volledig geslaagd (HTTP ${response.status}). Controleer de synchronisatiehistoriek.`);
    if (mode === "--dry-run" || result.remaining === 0) return;
    if (!Number.isInteger(result.remaining) || result.succeeded === 0) throw new Error("Geen voortgang in resterende accounts; controleer de historiek.");
  }
  throw new Error("Batchlimiet bereikt; controleer resterende accounts.");
}
main().catch((error) => {
  // Fetch failures can contain internal details: do not dump stack/cause.
  console.error(error instanceof Error ? error.message : "Social synchronisatie mislukt.");
  process.exitCode = 1;
});
