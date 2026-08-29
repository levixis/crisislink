import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTOMATIC_STATES,
  automaticStateForScore,
  checkHumanTransition,
  HUMAN_ACTION_TARGETS,
  nextAutomaticState,
  THRESHOLDS,
} from "@/lib/verification/state";

const auto = (over: Partial<Parameters<typeof nextAutomaticState>[0]> = {}) =>
  nextAutomaticState({
    current: "UNVERIFIED",
    score: 0,
    humanReviewed: false,
    isOfficialSource: false,
    ...over,
  });

test("THE safety rule: no score can ever produce ACTIVE", () => {
  // Walk the whole score range, not just the thresholds.
  for (let score = 0; score <= 1.0001; score += 0.01) {
    assert.notEqual(automaticStateForScore(score), "ACTIVE");
    assert.notEqual(automaticStateForScore(score), "RESOLVED");
  }
  // And a perfect score from every starting state still cannot reach ACTIVE.
  for (const current of AUTOMATIC_STATES) {
    const result = auto({ current, score: 1 });
    if (result.changed) assert.notEqual(result.to, "ACTIVE");
  }
});

test("automation will not touch an incident a human has activated", () => {
  const result = auto({ current: "ACTIVE", score: 0 });
  assert.equal(result.changed, false);
  assert.match(result.reason, /owned by a human/);
});

test("automation will not reopen a resolved incident", () => {
  const result = auto({ current: "RESOLVED", score: 1 });
  assert.equal(result.changed, false);
});

test("automation will not overrule a human downward, but may still raise", () => {
  const downgrade = auto({ current: "VERIFIED", score: 0.1, humanReviewed: true });
  assert.equal(downgrade.changed, false);
  assert.match(downgrade.reason, /does not downgrade/);

  const upgrade = auto({ current: "SUSPECTED", score: 0.95, humanReviewed: true });
  assert.equal(upgrade.changed, true);
  assert.equal(upgrade.changed && upgrade.to, "VERIFIED");
});

test("without human review, automation may downgrade as evidence weakens", () => {
  const result = auto({ current: "VERIFIED", score: 0.1, humanReviewed: false });
  assert.equal(result.changed, true);
  assert.equal(result.changed && result.to, "UNVERIFIED");
});

test("official-source incidents are never rescored by the crowd formula", () => {
  const result = auto({ current: "VERIFIED", score: 0, isOfficialSource: true });
  assert.equal(result.changed, false);
  assert.match(result.reason, /Official-source/);
});

test("thresholds map to the expected states at their boundaries", () => {
  assert.equal(automaticStateForScore(0), "UNVERIFIED");
  assert.equal(automaticStateForScore(THRESHOLDS.SUSPECTED - 0.001), "UNVERIFIED");
  assert.equal(automaticStateForScore(THRESHOLDS.SUSPECTED), "SUSPECTED");
  assert.equal(automaticStateForScore(THRESHOLDS.HIGH_CONFIDENCE), "HIGH_CONFIDENCE");
  assert.equal(automaticStateForScore(THRESHOLDS.VERIFIED), "VERIFIED");
  assert.equal(automaticStateForScore(1), "VERIFIED");
});

test("only a human action can target ACTIVE", () => {
  assert.equal(HUMAN_ACTION_TARGETS.activate, "ACTIVE");
  const targets = Object.values(HUMAN_ACTION_TARGETS);
  assert.ok(targets.includes("ACTIVE"));
});

test("a duty officer may escalate straight from unverified to active", () => {
  // Deliberately permissive: someone can see the fire out of the window.
  assert.deepEqual(checkHumanTransition("UNVERIFIED", "activate"), { allowed: true });
});

test("a resolved incident cannot be acted on again", () => {
  const result = checkHumanTransition("RESOLVED", "activate");
  assert.equal(result.allowed, false);
});

test("a person may confirm an incident automation already scored as verified", () => {
  // Same `state` value, different meaning: only a human confirmation records
  // who stands behind it and stops automation downgrading it later.
  assert.deepEqual(checkHumanTransition("VERIFIED", "verify", false), { allowed: true });

  const again = checkHumanTransition("VERIFIED", "verify", true);
  assert.equal(again.allowed, false);
  assert.match(again.reason, /already marked/);
});
