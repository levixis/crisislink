import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classificationToComponentValue,
  type Classification,
} from "@/lib/verification/classify";

const base: Classification = {
  matchesClaimedType: true,
  confidence: 0.9,
  estimatedSeverity: 4,
  plausible: true,
  firsthand: true,
  reasoning: "Describes rising water across a road.",
  model: "test",
};

test("a confident, matching, plausible report passes its confidence through", () => {
  assert.equal(classificationToComponentValue(base), 0.9);
});

test("text describing no event at all is worth nothing", () => {
  const value = classificationToComponentValue({ ...base, plausible: false, confidence: 0.99 });
  assert.equal(value, 0, "implausible text scores 0 regardless of model confidence");
});

test("a wrong-type report is discounted but not zeroed", () => {
  // The reporter may have picked the wrong dropdown for something real, so a
  // human should still see it — this must not silently bury the report.
  const value = classificationToComponentValue({ ...base, matchesClaimedType: false });
  assert.ok(value > 0, "a real event of the wrong type is not worthless");
  assert.ok(value < 0.25, "but it is weak support for the claim as filed");
});

test("mismatch confidence is inverted: a confident mismatch hurts more", () => {
  const confidentMismatch = classificationToComponentValue({
    ...base, matchesClaimedType: false, confidence: 1,
  });
  const unsureMismatch = classificationToComponentValue({
    ...base, matchesClaimedType: false, confidence: 0,
  });
  assert.ok(confidentMismatch < unsureMismatch);
});

test("every mapping stays inside 0..1", () => {
  for (const plausible of [true, false]) {
    for (const matches of [true, false]) {
      for (const confidence of [0, 0.25, 0.5, 0.75, 1]) {
        const value = classificationToComponentValue({
          ...base, plausible, matchesClaimedType: matches, confidence,
        });
        assert.ok(value >= 0 && value <= 1, `out of range: ${value}`);
      }
    }
  }
});

test("hearsay counts for less than an eyewitness", () => {
  // The independence assumption behind report count: five people repeating one
  // rumour is one rumour, not five witnesses.
  const seen = classificationToComponentValue(base);
  const heard = classificationToComponentValue({ ...base, firsthand: false });

  assert.ok(heard < seen, "a relayed account must not count as a full observation");
  assert.ok(heard > 0, "but it is still a signal worth showing a reviewer");
  assert.equal(heard, seen * 0.5);
});

test("uncertainty is not hearsay", () => {
  // Someone unsure what they are looking at is still looking at it. Confidence
  // and first-handedness are separate axes and must not be conflated.
  const unsureButPresent = classificationToComponentValue({
    ...base, confidence: 0.6, firsthand: true,
  });
  const confidentHearsay = classificationToComponentValue({
    ...base, confidence: 1, firsthand: false,
  });
  assert.ok(unsureButPresent > confidentHearsay);
});

test("implausible text stays worthless whether or not it is first-hand", () => {
  assert.equal(classificationToComponentValue({ ...base, plausible: false, firsthand: true }), 0);
  assert.equal(classificationToComponentValue({ ...base, plausible: false, firsthand: false }), 0);
});
