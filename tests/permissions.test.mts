import assert from "node:assert/strict";
import test from "node:test";

import {
  capabilities,
  hasPermission,
  type Capability,
  type MembershipAccess,
} from "../src/lib/permissions.ts";
import { requiredCapabilityForQuery } from "../src/lib/route-permissions.ts";

const managementCapabilities: Capability[] = [
  "manageOrganization",
  "manageInbox",
  "manageProjects",
  "manageContent",
  "manageEvents",
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

for (const role of ["member", "volunteer"]) {
  test(`${role} kan kosten indienen en AI gebruiken`, () => {
    assert.deepEqual(
      permittedCapabilities({ role, finance_role: "none" }),
      ["submitExpenses", "useAi"],
    );
  });
}

test("kostenindiener kan financiën bekijken maar niet beheren", () => {
  assert.deepEqual(
    permittedCapabilities({ role: "member", finance_role: "submitter" }),
    ["submitExpenses", "viewFinance", "useAi"],
  );
});

for (const financeRole of ["approver", "treasurer"]) {
  test(`${financeRole} kan financiën beheren zonder algemene beheerrechten`, () => {
    const actual = permittedCapabilities({ role: "member", finance_role: financeRole });
    assert.deepEqual(actual, [
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
