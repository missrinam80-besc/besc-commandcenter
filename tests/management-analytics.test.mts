import assert from "node:assert/strict";
import test from "node:test";
import {
  projectProgress,
  sponsorPerformance,
  workloadByPerson,
} from "../src/lib/management-analytics.ts";

test("projectvoortgang combineert taken en mijlpalen", () => {
  const result = projectProgress(
    [{ id: "p1", title: "Project", status: "active" }],
    [{ project_id: "p1", status: "done" }, { project_id: "p1", status: "todo" }],
    [{ project_id: "p1", is_done: true }],
  );
  assert.equal(result[0].percentage, 67);
  assert.equal(result[0].open, 1);
});

test("werkdruk telt achterstallige en niet-toegewezen taken", () => {
  const result = workloadByPerson(
    [
      { status: "todo", priority: "urgent", due_at: "2026-01-01", task_assignees: [{ user_id: "u1" }] },
      { status: "waiting", priority: "normal", due_at: null, task_assignees: [] },
    ],
    [{ user_id: "u1", name: "Linda" }],
    new Date("2026-02-01"),
  );
  assert.deepEqual(result[0], { id: "u1", name: "Linda", open: 1, overdue: 1, urgent: 1, waiting: 0 });
  assert.equal(result[1].name, "Niet toegewezen");
});

test("sponsorwaarde combineert campagnes en deliverables", () => {
  const result = sponsorPerformance(
    [{ id: "s1", name: "Sponsor", estimated_value: 1000 }],
    [{ id: "c1", partner_id: "s1", value: 750, impressions: 12000, clicks: 300 }],
    [
      { campaign_id: "c1", status: "completed", due_date: "2026-01-01" },
      { campaign_id: "c1", status: "todo", due_date: "2026-01-15" },
    ],
    "2026-02-01",
  );
  assert.equal(result[0].realizedValue, 750);
  assert.equal(result[0].completed, 1);
  assert.equal(result[0].overdue, 1);
});
