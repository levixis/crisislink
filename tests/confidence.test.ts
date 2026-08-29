import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SATURATION_REPORT_COUNT,
  scoreCluster,
  type ClusterReport,
} from "@/lib/verification/confidence";

const BASE = new Date("2026-08-28T10:00:00Z");
const CENTER = { lat: 19.076, lng: 72.8777 };

/** Builds a report offset from the cluster centre by roughly `metres`. */
function report(overrides: Partial<ClusterReport> & { id: string }): ClusterReport {
  return {
    userId: `user-${overrides.id}`,
    severity: 3,
    lat: CENTER.lat,
    lng: CENTER.lng,
    createdAt: BASE,
    ...overrides,
  };
}

const component = (breakdown: ReturnType<typeof scoreCluster>, key: string) =>
  breakdown.components.find((c) => c.key === key)!;

test("a single report cannot be dragged down by components it cannot have", () => {
  const single = scoreCluster({
    disasterType: "FLOOD",
    reports: [report({ id: "a" })],
    center: CENTER,
    officialCorroboration: null,
  });

  // Evidence is report count alone; quality falls back to a neutral 1.0
  // rather than punishing whoever reported first.
  assert.equal(single.qualityFactor, 1);
  assert.equal(single.score, 1 / SATURATION_REPORT_COUNT);

  for (const key of ["geographicTightness", "timeCorrelation", "reporterDiversity", "severityAgreement"]) {
    assert.equal(component(single, key).value, null, `${key} should be unavailable`);
  }
});

test("a flood is not penalised for the absence of an earthquake feed", () => {
  const flood = scoreCluster({
    disasterType: "FLOOD",
    reports: [report({ id: "a" }), report({ id: "b" })],
    center: CENTER,
    officialCorroboration: null,
  });

  const corroboration = component(flood, "officialCorroboration");
  assert.equal(corroboration.value, null);
  assert.match(corroboration.detail, /No official feed covers flood/);
  // Evidence therefore rests on report count alone, undiluted by a zero.
  assert.equal(flood.evidenceScore, 2 / SATURATION_REPORT_COUNT);
});

test("an uncorroborated earthquake IS penalised, because the feed was checked", () => {
  const shared = {
    disasterType: "EARTHQUAKE",
    reports: [report({ id: "a" }), report({ id: "b" })],
    center: CENTER,
  };

  const corroborated = scoreCluster({ ...shared, officialCorroboration: true });
  const contradicted = scoreCluster({ ...shared, officialCorroboration: false });

  assert.equal(component(corroborated, "officialCorroboration").value, 1);
  assert.equal(component(contradicted, "officialCorroboration").value, 0);
  assert.ok(corroborated.score > contradicted.score);
  // Same components were assessable in both, so only the value differs.
  assert.equal(corroborated.usedWeight, contradicted.usedWeight);
  // Corroboration is evidence, so it raises the ceiling rather than the
  // agreement factor.
  assert.ok(corroborated.evidenceScore > contradicted.evidenceScore);
  assert.equal(corroborated.qualityFactor, contradicted.qualityFactor);
});

test("report count saturates rather than growing without bound", () => {
  const build = (n: number) =>
    scoreCluster({
      disasterType: "FLOOD",
      reports: Array.from({ length: n }, (_, i) => report({ id: String(i) })),
      center: CENTER,
      officialCorroboration: null,
    });

  assert.equal(component(build(SATURATION_REPORT_COUNT), "reportCount").value, 1);
  assert.equal(component(build(SATURATION_REPORT_COUNT * 4), "reportCount").value, 1);
});

test("many reports from one account score far below many from many", () => {
  const reports = Array.from({ length: 5 }, (_, i) => report({ id: String(i) }));

  const brigaded = scoreCluster({
    disasterType: "FLOOD",
    reports: reports.map((r) => ({ ...r, userId: "same-person" })),
    center: CENTER,
    officialCorroboration: null,
  });
  const independent = scoreCluster({
    disasterType: "FLOOD",
    reports,
    center: CENTER,
    officialCorroboration: null,
  });

  assert.equal(component(brigaded, "reporterDiversity").value, 0);
  assert.equal(component(independent, "reporterDiversity").value, 1);
  assert.ok(independent.score > brigaded.score);
});

test("spread out in space and time scores below tight in space and time", () => {
  const tight = scoreCluster({
    disasterType: "FLOOD",
    reports: [report({ id: "a" }), report({ id: "b" })],
    center: CENTER,
    officialCorroboration: null,
  });

  const spread = scoreCluster({
    disasterType: "FLOOD",
    reports: [
      report({ id: "a" }),
      report({
        id: "b",
        // ~3.3 km north, so the MEAN distance from the centre (~1.7 km) is
        // past the 1 km reference, and two hours later, which is exactly the
        // time reference. Both components bottom out.
        lat: CENTER.lat + 0.03,
        createdAt: new Date(BASE.getTime() + 2 * 60 * 60 * 1000),
      }),
    ],
    center: CENTER,
    officialCorroboration: null,
  });

  assert.equal(component(spread, "geographicTightness").value, 0);
  assert.equal(component(spread, "timeCorrelation").value, 0);
  assert.ok(tight.score > spread.score);
});

test("disagreement about severity lowers the score", () => {
  const agree = scoreCluster({
    disasterType: "FLOOD",
    reports: [report({ id: "a", severity: 4 }), report({ id: "b", severity: 4 })],
    center: CENTER,
    officialCorroboration: null,
  });
  const disagree = scoreCluster({
    disasterType: "FLOOD",
    reports: [report({ id: "a", severity: 1 }), report({ id: "b", severity: 5 })],
    center: CENTER,
    officialCorroboration: null,
  });

  assert.equal(component(agree, "severityAgreement").value, 1);
  assert.equal(component(disagree, "severityAgreement").value, 0);
  assert.ok(agree.score > disagree.score);
});

test("score stays within 0..1 for a maximally corroborated cluster", () => {
  const best = scoreCluster({
    disasterType: "EARTHQUAKE",
    reports: Array.from({ length: 20 }, (_, i) => report({ id: String(i), severity: 4 })),
    center: CENTER,
    officialCorroboration: true,
    llmConfidence: 1,
  });

  assert.equal(best.score, 1);
  assert.ok(best.components.every((c) => c.value === null || (c.value >= 0 && c.value <= 1)));
});

test("tightness measures mean distance, so one outlier does not dominate", () => {
  // A design choice worth stating: with mean distance, four reports on one
  // street plus one stray 2 km away still reads as a tight cluster. With max
  // distance the stray would zero the component on its own. Mean is the more
  // forgiving and, for crowd data with poor GPS fixes, the more honest one.
  const withOutlier = scoreCluster({
    disasterType: "FLOOD",
    reports: [
      ...Array.from({ length: 4 }, (_, i) => report({ id: String(i) })),
      report({ id: "stray", lat: CENTER.lat + 0.018 }),
    ],
    center: CENTER,
    officialCorroboration: null,
  });

  const tightness = component(withOutlier, "geographicTightness").value!;
  assert.ok(tightness > 0.5, `one outlier in five should not zero tightness (got ${tightness})`);
  assert.ok(tightness < 1);
});

test("agreement cannot manufacture confidence that evidence does not support", () => {
  // The regression this formula's shape exists to prevent: a flat weighted sum
  // let two perfectly-agreeing reports leap to 0.76, skipping SUSPECTED
  // entirely and making that state unreachable in practice.
  const perfectPair = scoreCluster({
    disasterType: "FLOOD",
    reports: [report({ id: "a" }), report({ id: "b" })],
    center: CENTER,
    officialCorroboration: null,
  });

  assert.equal(perfectPair.qualityFactor, 1, "two identical reports agree perfectly");
  // ...and yet two reports out of five is still only two reports.
  assert.equal(perfectPair.score, 2 / SATURATION_REPORT_COUNT);
  assert.ok(perfectPair.score < 0.6, "must not reach HIGH_CONFIDENCE on two reports");
});

test("the score curve rises monotonically and uses every state band", () => {
  const scoreAt = (n: number) =>
    scoreCluster({
      disasterType: "FLOOD",
      reports: Array.from({ length: n }, (_, i) => report({ id: String(i) })),
      center: CENTER,
      officialCorroboration: null,
    }).score;

  const curve = [1, 2, 3, 4, 5].map(scoreAt);
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i] > curve[i - 1], `score must rise from ${i} to ${i + 1} reports`);
  }
  // Every automatic band is actually reachable as reports accumulate.
  assert.ok(curve[0] < 0.35, "one report stays unverified");
  assert.ok(curve[1] >= 0.35 && curve[1] < 0.6, "two reports land in SUSPECTED");
  assert.ok(curve[2] >= 0.6 && curve[2] < 0.8, "three reports land in HIGH_CONFIDENCE");
  assert.ok(curve[4] >= 0.8, "five reports reach VERIFIED");
});

test("quality discounts a large but incoherent cluster", () => {
  // Five reports, all from one account, spread wide in space and time, with
  // wildly different severities: plenty of volume, no coherence.
  const incoherent = scoreCluster({
    disasterType: "FLOOD",
    reports: Array.from({ length: 5 }, (_, i) =>
      report({
        id: String(i),
        userId: "one-person",
        severity: (i % 5) + 1,
        lat: CENTER.lat + i * 0.02,
        createdAt: new Date(BASE.getTime() + i * 45 * 60 * 1000),
      }),
    ),
    center: CENTER,
    officialCorroboration: null,
  });

  assert.equal(incoherent.evidenceScore, 1, "volume alone is at saturation");
  assert.ok(incoherent.qualityFactor < 0.35, "but the reports do not agree");
  assert.ok(incoherent.score < 0.35, "so it stays unverified despite five reports");
});
