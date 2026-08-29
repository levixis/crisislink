/**
 * Step 3 of the verification pipeline: how much do we believe this cluster?
 *
 * DESIGN INTENT
 * -------------
 * Deliberately NOT a learned model. For a system whose output can dispatch
 * emergency responders, being able to say "this scored 0.62 because four
 * separate people reported the same thing within 400 m and 20 minutes of each
 * other" is worth more than a few points of accuracy from an opaque model.
 * Every component below can be read off the dashboard and argued with.
 *
 * EVIDENCE x QUALITY, NOT ONE FLAT SUM
 * ------------------------------------
 * Components fall into two groups that do different jobs:
 *
 *     score = evidence x quality
 *
 *  - EVIDENCE (report count, official corroboration) is how much independent
 *    support the claim has. It sets the ceiling.
 *  - QUALITY (spatial tightness, time correlation, reporter diversity,
 *    severity agreement, and later text classification) is whether the reports
 *    we have actually agree. It can only discount that ceiling, never raise it.
 *
 * The first version of this file was one flat weighted sum, and testing it
 * against real clustered reports showed why that is wrong. The quality signals
 * are all near 1.0 for any tight pair of reports, so the moment a second
 * report arrived they all activated at once and dragged the score from 0.20 to
 * 0.76 in a single step — straight past SUSPECTED, which became unreachable.
 * A flat sum lets agreement manufacture confidence that the amount of evidence
 * does not support. Two people agreeing perfectly is still only two people.
 *
 * Multiplying keeps the two ideas separate and gives a monotone, well-spread
 * curve: with one report you cannot exceed 0.20 however tidy it looks, and
 * five reports that contradict each other are discounted back down again.
 *
 * AVAILABILITY, NOT ZERO
 * ----------------------
 * A component that cannot be *meaningfully computed* reports itself as
 * unavailable (`value: null`) rather than scoring 0, and the final score is
 * renormalised over the weights that were actually used.
 *
 * This matters more than it looks. A single report has no geographic spread,
 * no time span and no reporter diversity — scoring those 0 would mean a
 * genuine first report of a real disaster could never exceed 0.30, no matter
 * how credible. Likewise, official corroboration is only available for
 * disaster types some feed actually covers: we currently ingest earthquakes
 * only, so scoring a flood 0 on corroboration would silently cap every flood
 * in the country at 0.80 for a reason that has nothing to do with the flood.
 *
 * Renormalisation makes the score mean "of the evidence we could assess, this
 * fraction supports the claim", which is the honest reading.
 *
 * TUNING
 * ------
 * The weights below are a starting point chosen on the reasoning recorded
 * against each constant, not fitted to data — there is no labelled dataset of
 * verified Indian disaster reports to fit them to. They are stated here in one
 * place precisely so they can be argued with and changed.
 */
import { haversineMeters } from "@/lib/geo";

// --- Tunable constants -----------------------------------------------------

/**
 * Reports needed before the count component saturates.
 *
 * Rationale: the first few independent reports carry most of the information —
 * going from one report to three changes the picture far more than going from
 * eleven to thirteen. Five is the point past which extra reports of the *same*
 * event tell us little, and capping there also blunts the obvious attack of
 * one incident being brigaded by volume.
 */
export const SATURATION_REPORT_COUNT = 5;

/**
 * Radius (metres) at which geographic spread stops counting as "tight".
 * Matches the clustering radius: reports spread across the whole cluster
 * footprint are weaker evidence of one event than reports on one street.
 */
export const TIGHTNESS_REFERENCE_METERS = 1_000;

/**
 * Time span (ms) at which time correlation reaches zero. Matches the
 * clustering window: five reports inside ten minutes is a live event, the same
 * five spread over two hours is much weaker evidence of a single incident.
 */
export const TIME_REFERENCE_MS = 2 * 60 * 60 * 1_000;

/**
 * Standard deviation of severity ratings treated as total disagreement.
 * On a 1-5 scale, a spread of about 1.5 means reporters genuinely disagree
 * about what they are looking at (one says "minor", another "severe").
 */
export const SEVERITY_DISAGREEMENT_STDEV = 1.5;

/**
 * EVIDENCE weights — how much independent support exists for the claim.
 * These set the ceiling on confidence.
 */
export const EVIDENCE_WEIGHTS = {
  /** Independent people saying the same thing is the strongest single signal. */
  reportCount: 0.65,
  /** A seismograph or an agency agreeing is strong, but does not by itself
   *  establish the *citizen* claim (people report flooding that USGS never
   *  sees), so it sits below report count. */
  officialCorroboration: 0.35,
} as const;

/**
 * QUALITY weights — do the reports we have actually agree with each other?
 * These can only discount the evidence, never add to it.
 */
export const QUALITY_WEIGHTS = {
  /** Tight clustering distinguishes one event from unrelated similar events. */
  geographicTightness: 0.25,
  /** Reports bunched in time distinguish an event from a rolling grumble. */
  timeCorrelation: 0.25,
  /** Ten reports from one account is one opinion, not ten. */
  reporterDiversity: 0.15,
  /** Reporters agreeing on how bad it is suggests they see the same thing. */
  severityAgreement: 0.15,
  /** Phase 3: does the free text plausibly describe the claimed disaster? */
  llmClassification: 0.2,
} as const;

export const WEIGHTS = { ...EVIDENCE_WEIGHTS, ...QUALITY_WEIGHTS } as const;

export type ComponentKey = keyof typeof WEIGHTS;
export type ComponentGroup = "evidence" | "quality";

const GROUP_OF: Record<ComponentKey, ComponentGroup> = {
  reportCount: "evidence",
  officialCorroboration: "evidence",
  geographicTightness: "quality",
  timeCorrelation: "quality",
  reporterDiversity: "quality",
  severityAgreement: "quality",
  llmClassification: "quality",
};

/** Disaster types for which an official feed exists, so corroboration is a
 *  meaningful question to ask. Extend as feeds are added in later phases. */
export const OFFICIALLY_COVERED_TYPES = new Set(["EARTHQUAKE"]);

// --- Types -----------------------------------------------------------------

export type ClusterReport = {
  id: string;
  userId: string;
  severity: number;
  lat: number;
  lng: number;
  createdAt: Date;
};

export type ScoringInput = {
  disasterType: string;
  reports: ClusterReport[];
  /** Cluster centre the reports are measured against. */
  center: { lat: number; lng: number };
  /**
   * Whether an official-feed incident corroborates this cluster in space and
   * time. Pass `null` when the question could not be asked (no feed covers
   * this disaster type) — distinct from `false`, which means we looked and
   * found nothing.
   */
  officialCorroboration: boolean | null;
  /** Phase 3. `null` until the LLM classification step exists. */
  llmConfidence?: number | null;
};

export type ScoredComponent = {
  key: ComponentKey;
  group: ComponentGroup;
  label: string;
  weight: number;
  /** 0-1, or null when the component could not be meaningfully computed. */
  value: number | null;
  /** One line of plain English for the dashboard and the audit trail. */
  detail: string;
};

export type ConfidenceBreakdown = {
  /** Final confidence, 0-1. Equals evidenceScore * qualityFactor. */
  score: number;
  /** How much independent support exists, 0-1. The ceiling. */
  evidenceScore: number;
  /** How well the reports agree, 0-1. Discounts the ceiling. */
  qualityFactor: number;
  components: ScoredComponent[];
  /** Sum of the weights that were actually available across both groups. */
  usedWeight: number;
};

// --- Small statistics helpers ---------------------------------------------

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function populationStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// --- The formula -----------------------------------------------------------

export function scoreCluster(input: ScoringInput): ConfidenceBreakdown {
  const { reports, center, disasterType, officialCorroboration } = input;
  const n = reports.length;

  // Several components compare reports against each other, which is
  // meaningless with only one report. They report unavailable rather than 0.
  const comparable = n >= 2;

  const components: ScoredComponent[] = [];

  // 1. Report count, with diminishing returns via a hard saturation point.
  components.push({
    key: "reportCount",
    label: "Independent reports",
    group: GROUP_OF.reportCount,
    weight: WEIGHTS.reportCount,
    value: clamp01(n / SATURATION_REPORT_COUNT),
    detail:
      n >= SATURATION_REPORT_COUNT
        ? `${n} reports (at or above the saturation point of ${SATURATION_REPORT_COUNT})`
        : `${n} of ${SATURATION_REPORT_COUNT} reports needed to saturate`,
  });

  // 2. Geographic tightness: mean distance of reports from the cluster centre.
  if (comparable) {
    const meanDistance =
      reports.reduce((acc, r) => acc + haversineMeters(center, r), 0) / n;
    components.push({
      key: "geographicTightness",
      label: "Geographic tightness",
      group: GROUP_OF.geographicTightness,
    weight: WEIGHTS.geographicTightness,
      value: clamp01(1 - meanDistance / TIGHTNESS_REFERENCE_METERS),
      detail: `Reports average ${Math.round(meanDistance)} m from the cluster centre`,
    });
  } else {
    components.push({
      key: "geographicTightness",
      label: "Geographic tightness",
      group: GROUP_OF.geographicTightness,
    weight: WEIGHTS.geographicTightness,
      value: null,
      detail: "Needs at least two reports",
    });
  }

  // 3. Time correlation: how tightly the reports are bunched.
  if (comparable) {
    const times = reports.map((r) => r.createdAt.getTime());
    const spanMs = Math.max(...times) - Math.min(...times);
    components.push({
      key: "timeCorrelation",
      label: "Time correlation",
      group: GROUP_OF.timeCorrelation,
    weight: WEIGHTS.timeCorrelation,
      value: clamp01(1 - spanMs / TIME_REFERENCE_MS),
      detail: `All reports arrived within ${Math.round(spanMs / 60_000)} min`,
    });
  } else {
    components.push({
      key: "timeCorrelation",
      label: "Time correlation",
      group: GROUP_OF.timeCorrelation,
    weight: WEIGHTS.timeCorrelation,
      value: null,
      detail: "Needs at least two reports",
    });
  }

  // 4. Reporter diversity: distinct accounts, normalised so that "every report
  //    from a different person" scores 1 and "all from one person" scores 0.
  if (comparable) {
    const distinct = new Set(reports.map((r) => r.userId)).size;
    components.push({
      key: "reporterDiversity",
      label: "Reporter diversity",
      group: GROUP_OF.reporterDiversity,
    weight: WEIGHTS.reporterDiversity,
      value: clamp01((distinct - 1) / (n - 1)),
      detail: `${distinct} distinct account${distinct === 1 ? "" : "s"} across ${n} reports`,
    });
  } else {
    components.push({
      key: "reporterDiversity",
      label: "Reporter diversity",
      group: GROUP_OF.reporterDiversity,
    weight: WEIGHTS.reporterDiversity,
      value: null,
      detail: "Needs at least two reports",
    });
  }

  // 5. Severity agreement: do reporters describe the same magnitude of event?
  if (comparable) {
    const stdev = populationStdev(reports.map((r) => r.severity));
    components.push({
      key: "severityAgreement",
      label: "Severity agreement",
      group: GROUP_OF.severityAgreement,
    weight: WEIGHTS.severityAgreement,
      value: clamp01(1 - stdev / SEVERITY_DISAGREEMENT_STDEV),
      detail: `Severity ratings vary by ${stdev.toFixed(2)} (standard deviation)`,
    });
  } else {
    components.push({
      key: "severityAgreement",
      label: "Severity agreement",
      group: GROUP_OF.severityAgreement,
    weight: WEIGHTS.severityAgreement,
      value: null,
      detail: "Needs at least two reports",
    });
  }

  // 6. Official corroboration — only askable where a feed covers this hazard.
  const covered = OFFICIALLY_COVERED_TYPES.has(disasterType);
  components.push({
    key: "officialCorroboration",
    label: "Official corroboration",
    group: GROUP_OF.officialCorroboration,
    weight: WEIGHTS.officialCorroboration,
    value: !covered || officialCorroboration === null ? null : officialCorroboration ? 1 : 0,
    detail: !covered
      ? `No official feed covers ${disasterType.toLowerCase().replace(/_/g, " ")} yet`
      : officialCorroboration === null
        ? "Official feeds could not be checked"
        : officialCorroboration
          ? "An official hazard event matches this cluster in place and time"
          : "No official hazard event matches this cluster",
  });

  // 7. LLM classification — Phase 3. Present as a declared-but-unavailable
  //    component so the dashboard shows what the score does not yet include.
  const llm = input.llmConfidence ?? null;
  components.push({
    key: "llmClassification",
    label: "Text classification",
    group: GROUP_OF.llmClassification,
    weight: WEIGHTS.llmClassification,
    value: llm === null ? null : clamp01(llm),
    detail: llm === null ? "Not implemented until Phase 3" : `Classifier confidence ${llm.toFixed(2)}`,
  });

  // Each group is a weighted mean over whichever of its components were
  // available, so an unavailable component is excluded from both numerator and
  // denominator rather than counted as zero.
  const weightedMean = (group: ComponentGroup, fallback: number) => {
    const available = components.filter((c) => c.group === group && c.value !== null);
    const weight = available.reduce((acc, c) => acc + c.weight, 0);
    if (weight === 0) return { value: fallback, usedWeight: 0 };
    const sum = available.reduce((acc, c) => acc + (c.value as number) * c.weight, 0);
    return { value: sum / weight, usedWeight: weight };
  };

  // With no evidence at all there is nothing to be confident about (0). With
  // no assessable quality signals — a lone report — we do not punish the
  // reporter for being first, so quality falls back to a neutral 1.0 and the
  // evidence ceiling alone decides the score.
  const evidence = weightedMean("evidence", 0);
  const quality = weightedMean("quality", 1);

  return {
    score: clamp01(evidence.value * quality.value),
    evidenceScore: evidence.value,
    qualityFactor: quality.value,
    components,
    usedWeight: evidence.usedWeight + quality.usedWeight,
  };
}
