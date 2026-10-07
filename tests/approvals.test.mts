import assert from "node:assert/strict";
import test from "node:test";
import { approvalCounts, canReviewApproval } from "../src/lib/approvals.ts";

const volunteer = {
  role: "volunteer",
  finance_role: "none",
} as const;

test("bestuurders met de functie Goedkeurder kunnen alle goedkeuringen behandelen", () => {
  assert.equal(canReviewApproval({ ...volunteer, role: "board", finance_role: "approver" }, "content"), true);
  assert.equal(canReviewApproval({ ...volunteer, role: "board", finance_role: "approver" }, "partner"), true);
  assert.equal(canReviewApproval({ ...volunteer, role: "board", finance_role: "approver" }, "document"), true);
});

test("financiële goedkeurders kunnen alleen kosten behandelen", () => {
  const approver = { ...volunteer, finance_role: "approver" as const };
  assert.equal(canReviewApproval(approver, "expense"), true);
  assert.equal(canReviewApproval(approver, "content"), false);
});

test("vrijwilligers kunnen aanvragen volgen maar niet zelf beslissen", () => {
  assert.equal(canReviewApproval(volunteer, "content"), false);
  assert.equal(canReviewApproval(volunteer, "expense"), false);
});

test("werkvoorraadtellingen onderscheiden open, eigen en afgehandelde aanvragen", () => {
  const counts = approvalCounts([
    { status: "pending", requested_by: "linda" },
    { status: "changes_requested", requested_by: "linda" },
    { status: "approved", requested_by: "linda" },
    { status: "rejected", requested_by: "ander" },
  ], "linda");
  assert.deepEqual(counts, {
    pending: 1,
    changesRequested: 1,
    mine: 2,
    completed: 2,
  });
});
