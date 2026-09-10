import assert from "node:assert/strict";
import test from "node:test";

import {
  canViewInternalPath,
  requiredCapabilityForQuery,
} from "../src/lib/route-permissions.ts";
import {
  capabilities,
  hasPermission,
  type Capability,
  type MembershipAccess,
} from "../src/lib/permissions.ts";

const managementCapabilities: Capability[] = [
  "manageOrganization",
  "manageInbox",
  "manageIntegrations",
  "manageKpis",
  "manageAiTemplates",
];

function permittedCapabilities(membership: MembershipAccess) {
  return capabilities.filter((capability) => hasPermission(membership, capability));
}

test("beheerder heeft alle rechten", () => {
  assert.deepEqual(
    permittedCapabilities({ role: "admin", finance_role: "none" }),
    capabilities,
  );
});

test("custom rolprofiel kan extra capabilities toevoegen bovenop de basisrol", () => {
  const actual = permittedCapabilities({
    role: "volunteer",
    finance_role: "none",
    capabilities: ["manageContent", "manageEvents"],
  });
  assert.equal(actual.includes("manageContent"), true);
  assert.equal(actual.includes("manageEvents"), true);
  assert.equal(actual.includes("manageUsers"), false);
});

test("bestuur beheert de organisatie maar niet de gebruikers", () => {
  const actual = permittedCapabilities({ role: "board", finance_role: "none" });
  assert.deepEqual(actual, capabilities.filter((capability) => capability !== "manageUsers"));
});

test("medewerker kan samenwerken in planning, uitvoering en content", () => {
  assert.deepEqual(
    permittedCapabilities({ role: "member", finance_role: "none" }),
    ["manageProjects", "manageContent", "manageEvents", "submitExpenses", "useAi"],
  );
});

test("vrijwilliger blijft beperkt tot eigen werk, kalender en kennisbank", () => {
  assert.deepEqual(
    permittedCapabilities({ role: "volunteer", finance_role: "none" }),
    ["submitExpenses", "useAi"],
  );
});

test("kostenindiener kan financiën bekijken maar niet beheren", () => {
  assert.deepEqual(
    permittedCapabilities({ role: "member", finance_role: "submitter" }),
    ["manageProjects", "manageContent", "manageEvents", "submitExpenses", "viewFinance", "useAi"],
  );
});

for (const financeRole of ["approver", "treasurer"]) {
  test(`${financeRole} kan financiën beheren zonder algemene beheerrechten`, () => {
    const actual = permittedCapabilities({ role: "member", finance_role: financeRole });
    assert.deepEqual(actual, [
      "manageProjects",
      "manageContent",
      "manageEvents",
      "manageFinance",
      "submitExpenses",
      "viewFinance",
      "useAi",
    ]);
    for (const capability of managementCapabilities) {
      assert.equal(actual.includes(capability), false);
    }
  });
}

test("directe app-routes volgen de afgesproken zichtbaarheid per rol", () => {
  const admin = { role: "admin", finance_role: "none" };
  const board = { role: "board", finance_role: "none" };
  const member = { role: "member", finance_role: "none" };
  const volunteer = { role: "volunteer", finance_role: "none" };

  assert.equal(canViewInternalPath("/app/beheer/gebruikers", admin), true);
  assert.equal(canViewInternalPath("/app/beheer/gebruikers", board), false);
  assert.equal(canViewInternalPath("/app/inbox", member), true);
  assert.equal(canViewInternalPath("/app/rapportage/social", member), true);
  assert.equal(canViewInternalPath("/app/rapportage/sponsors", member), true);
  assert.equal(canViewInternalPath("/app/rapportage/sponsors/sponsor-1", member), true);
  assert.equal(canViewInternalPath("/app/rapportage/creators", member), true);
  assert.equal(canViewInternalPath("/app/rapportage/creators/streamer-1", member), true);
  assert.equal(canViewInternalPath("/app/administratie", member), false);
  assert.equal(canViewInternalPath("/app/financien", member), false);
  assert.equal(canViewInternalPath("/app/financien", member, new URLSearchParams("nieuw=kost")), true);
  assert.equal(canViewInternalPath("/app/taken", volunteer), true);
  assert.equal(canViewInternalPath("/app/kalender", volunteer), true);
  assert.equal(canViewInternalPath("/app/kennisbank/artikel-1", volunteer), true);
  assert.equal(canViewInternalPath("/app/inbox", volunteer), false);
  assert.equal(canViewInternalPath("/app/projecten", volunteer), false);
  assert.equal(canViewInternalPath("/app/rapportage/sponsors", volunteer), false);
  assert.equal(canViewInternalPath("/app/rapportage/creators", volunteer), false);
});

const routeCases: Array<{
  label: string;
  url: string;
  expected: Capability | null;
}> = [
  { label: "gewone overzichtspagina", url: "/app/projecten", expected: null },
  { label: "nieuwe losse taak", url: "/app/taken?nieuw=1", expected: null },
  {
    label: "nieuwe taak binnen project",
    url: "/app/projecten/project-1?nieuw=taak",
    expected: null,
  },
  { label: "nieuwe kost", url: "/app/financien?nieuw=kost", expected: null },
  {
    label: "eigen kost bewerken",
    url: "/app/financien/kosten/kost-1?bewerken=1",
    expected: null,
  },
  {
    label: "project aanmaken",
    url: "/app/projecten?nieuw=1",
    expected: "manageProjects",
  },
  {
    label: "project bewerken",
    url: "/app/projecten/project-1?bewerken=1",
    expected: "manageProjects",
  },
  { label: "inbox beheren", url: "/app/inbox?bewerken=1", expected: "manageInbox" },
  { label: "content maken", url: "/app/content?nieuw=1", expected: "manageContent" },
  { label: "event maken", url: "/app/events?nieuw=1", expected: "manageEvents" },
  {
    label: "budget maken",
    url: "/app/financien/budgetten?nieuw=1",
    expected: "manageFinance",
  },
  {
    label: "inkomst bewerken",
    url: "/app/financien/inkomsten/inkomst-1?bewerken=1",
    expected: "manageFinance",
  },
  {
    label: "KPI beheren",
    url: "/app/rapportage?nieuw=1",
    expected: "manageKpis",
  },
  {
    label: "AI-template beheren",
    url: "/app/ai-hub?bewerken=1",
    expected: "manageAiTemplates",
  },
  {
    label: "integratie beheren",
    url: "/app/integraties?nieuw=1",
    expected: "manageIntegrations",
  },
  {
    label: "overige organisatiemodule beheren",
    url: "/app/vergaderingen?nieuw=1",
    expected: "manageOrganization",
  },
];

for (const { label, url, expected } of routeCases) {
  test(`routebeveiliging: ${label}`, () => {
    const parsed = new URL(url, "https://commandcenter.besc.be");
    assert.equal(
      requiredCapabilityForQuery(parsed.pathname, parsed.searchParams),
      expected,
    );
  });
}
