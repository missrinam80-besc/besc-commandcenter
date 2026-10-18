import { readFileSync } from "node:fs";

export function rewardsIntakeConcurrencyFixture() {
  // Callback replacement preserves PostgreSQL dollar quotes literally.
  let fixture = readFileSync(new URL("./rewards-fixture.sql", import.meta.url), "utf8").replace(
    "create role anon; create role authenticated; create role service_role bypassrls;",
    () => `do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls;end if;
end$$;`,
  );
  for (const file of ["./rewards-intake-fixture.sql", "../../supabase/migrations/20261017162100_bucks_xp_v1.sql", "../../supabase/migrations/20261018213441_rewards_intake_receipts.sql"]) {
    fixture += readFileSync(new URL(file, import.meta.url), "utf8");
  }
  return fixture;
}
