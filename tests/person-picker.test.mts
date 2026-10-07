import assert from "node:assert/strict";
import test from "node:test";
import { filterPeople, toPersonPickerOptions } from "../src/lib/person-picker.ts";

const people = toPersonPickerOptions([
  { id: "1", display_name: "Élodie Peeters", handle: "@GameLady", discord_handle: "elodie_besc", community_person_roles: [{ role: "volunteer" }] },
  { id: "2", display_name: "Jan Janssens", handle: "JStreamer", discord_handle: null, community_person_roles: [{ role: "streamteam" }] },
]);

test("personen zijn vindbaar via naam, accenten, handle, Discord en Nederlandse rol", () => {
  for (const query of ["elodie", "@gamelady", "elodie_besc", "vrijwilliger", "peeters elodie", "gamelady vrijwilliger"]) {
    assert.deepEqual(filterPeople(people, query).map(p => p.id), ["1"]);
  }
  assert.deepEqual(filterPeople(people, "streamteam").map(p => p.id), ["2"]);
  assert.equal(filterPeople(people, "niet aanwezig").length, 0);
  assert.equal(filterPeople(people, "  ").length, 2);
});

test("zoeken gebeurt vóór de resultaatlimiet, ook voor personen buiten de eerste dertig", () => {
  const large = Array.from({ length: 80 }, (_, index) => ({ id: String(index), label: `Persoon ${index}` }));
  assert.deepEqual(filterPeople(large, "Persoon 79").map(p => p.id), ["79"]);
});
