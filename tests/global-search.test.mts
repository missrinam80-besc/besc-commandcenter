import assert from "node:assert/strict";
import test from "node:test";
import {
  groupSearchResults,
  rankSearchResults,
  searchPattern,
  type SearchResult,
} from "../src/lib/global-search.ts";

const results: SearchResult[] = [
  { id: "1", title: "Sunday Sessions planning", source: "task", sourceLabel: "Taken", href: "/1", status: "todo", updatedAt: "2026-07-20" },
  { id: "2", title: "Sunday Sessions", source: "project", sourceLabel: "Projecten", href: "/2", status: "active", updatedAt: "2026-07-18" },
  { id: "3", title: "Recap Sunday Sessions", source: "content", sourceLabel: "Content", href: "/3", status: "draft", updatedAt: "2026-07-25" },
];

test("zoekpatroon verwijdert onbedoelde wildcards", () => {
  assert.equal(searchPattern("  Sunday_%  "), "%Sunday%");
});

test("exacte en beginnende titels komen eerst", () => {
  assert.deepEqual(rankSearchResults(results, "Sunday Sessions").map((item) => item.id), ["2", "1", "3"]);
});

test("zoekresultaten worden per module gegroepeerd", () => {
  const grouped = groupSearchResults(results);
  assert.equal(grouped.task.length, 1);
  assert.equal(grouped.project[0].id, "2");
});
