import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260803163000_add_assets_and_shop_relations.sql", "utf8");
const assets = readFileSync("src/app/app/materialen/page.tsx", "utf8");
const actions = readFileSync("src/app/app/materialen/actions.ts", "utf8");
const legacyAssets = readFileSync("src/app/app/shop/activa/page.tsx", "utf8");
const navigation = readFileSync("src/components/persistent-app-shell.tsx", "utf8");
const accessMatrix = readFileSync("src/lib/access-matrix.ts", "utf8");
const forms = readFileSync("src/components/shop-forms.tsx", "utf8");

test("materialen en resources hebben verantwoordelijke, locatie, waarde en dossierrelaties", () => {
  assert.match(migration, /create table public\.assets/);
  assert.match(migration, /owner_person_id uuid references public\.community_people/);
  assert.match(migration, /location text/);
  assert.match(migration, /supplier_id uuid references public\.partners/);
  assert.match(assets, /Materialen & resources/);
  assert.match(assets, /projecten, events,/);
  assert.match(actions, /mode: z\.enum\(\["archive", "delete"\]\)/);
});

test("de materialeninventaris staat onder organisatie en behoudt legacy redirect", () => {
  assert.match(navigation, /Materialen & resources/);
  assert.match(navigation, /href: "\/app\/materialen"/);
  assert.match(accessMatrix, /key: "materials"/);
  assert.match(accessMatrix, /Streammateriaal, eventresources, hardware, licenties/);
  assert.match(legacyAssets, /redirect\("\/app\/materialen"\)/);
});

test("de materialeninventaris gebruikt organisatie-RLS", () => {
  assert.match(migration, /alter table public\.assets enable row level security/);
  assert.match(migration, /private\.is_active_member\(organization_id\)/);
  assert.match(migration, /private\.is_org_manager\(organization_id\)/);
});

test("shopproducten onderscheiden merchandise van Stream Graphics en hergebruiken leveranciers", () => {
  assert.match(migration, /product_family in \('stream_graphics','merchandise'\)/);
  assert.match(migration, /producer_id uuid references public\.partners/);
  assert.match(forms, /Stream Graphics Shop/);
  assert.match(forms, /name="supplier_id"/);
  assert.match(forms, /name="producer_id"/);
});
