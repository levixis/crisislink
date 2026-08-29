import assert from "node:assert/strict";
import { test } from "node:test";
import { byPriority, explainPriority, urgencyScore } from "@/lib/priority";

const at = (iso: string) => new Date(iso);
const inc = (over: Partial<Parameters<typeof byPriority>[0]> = {}) => ({
  state: "UNVERIFIED" as const,
  severity: 3,
  peopleInDanger: 0,
  createdAt: at("2026-08-29T10:00:00Z"),
  ...over,
});

test("human judgement outranks arithmetic", () => {
  // A modest activated incident beats a dramatic unverified one.
  const activated = inc({ state: "ACTIVE", severity: 1, peopleInDanger: 0 });
  const dramatic = inc({ state: "UNVERIFIED", severity: 5, peopleInDanger: 200 });
  assert.ok(byPriority(activated, dramatic) < 0);
});

test("within a state band, severity times exposure decides", () => {
  const many = inc({ state: "VERIFIED", severity: 3, peopleInDanger: 10 });
  const few = inc({ state: "VERIFIED", severity: 3, peopleInDanger: 1 });
  assert.ok(byPriority(many, few) < 0);
});

test("a severe incident with nobody yet reported trapped does not fall to zero", () => {
  // The bug the `1 +` exists to prevent: "no one has reported being trapped"
  // is not "no one is trapped".
  const severeNoReports = inc({ severity: 5, peopleInDanger: 0 });
  const minorNoReports = inc({ severity: 1, peopleInDanger: 0 });
  assert.ok(urgencyScore(severeNoReports) > 0);
  assert.ok(byPriority(severeNoReports, minorNoReports) < 0);
});

test("ties break toward the older incident so nothing starves", () => {
  const older = inc({ createdAt: at("2026-08-29T08:00:00Z") });
  const newer = inc({ createdAt: at("2026-08-29T11:00:00Z") });
  assert.ok(byPriority(older, newer) < 0);
});

test("resolved incidents sink to the bottom", () => {
  const resolved = inc({ state: "RESOLVED", severity: 5, peopleInDanger: 100 });
  const open = inc({ state: "UNVERIFIED", severity: 1, peopleInDanger: 0 });
  assert.ok(byPriority(resolved, open) > 0);
});

test("a full queue sorts into the order a duty officer would work it", () => {
  const queue = [
    inc({ state: "RESOLVED", severity: 5, peopleInDanger: 50 }),
    inc({ state: "VERIFIED", severity: 2, peopleInDanger: 0 }),
    inc({ state: "ACTIVE", severity: 1, peopleInDanger: 0 }),
    inc({ state: "VERIFIED", severity: 4, peopleInDanger: 3 }),
    inc({ state: "UNVERIFIED", severity: 5, peopleInDanger: 99 }),
  ];
  const order = [...queue].sort(byPriority).map((i) => `${i.state}/${i.severity}`);
  assert.deepEqual(order, [
    "ACTIVE/1",
    "VERIFIED/4",
    "VERIFIED/2",
    "UNVERIFIED/5",
    "RESOLVED/5",
  ]);
});

test("the explanation states the arithmetic it used", () => {
  const text = explainPriority(inc({ state: "VERIFIED", severity: 4, peopleInDanger: 2 }));
  assert.match(text, /4 × \(1 \+ 2\) = 12/);
});
