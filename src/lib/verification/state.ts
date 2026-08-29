/**
 * Step 5 of the verification pipeline: the incident state machine.
 *
 * THE SAFETY RULE
 * ---------------
 * Confidence scoring may move an incident along:
 *
 *     UNVERIFIED -> SUSPECTED -> HIGH_CONFIDENCE -> VERIFIED
 *
 * It may NOT move an incident to ACTIVE. ACTIVE is the state that sends real
 * alerts to real people's phones, and it requires a named human who can be
 * held accountable for the decision. RESOLVED is likewise human-only: an
 * automated process must never declare an emergency over.
 *
 * This is enforced structurally, not by convention: the automatic path and the
 * human path are separate exported functions, and ACTIVE/RESOLVED are simply
 * unreachable from `nextAutomaticState`. If you are reading this because you
 * want automatic activation — that is the one change this project should not
 * make. A false alarm sent to every phone in a district is far more damaging
 * than an alert that waits ninety seconds for a duty officer to confirm it.
 */
import type { IncidentState } from "@/generated/prisma/enums";

/**
 * Score thresholds. Chosen to be defensible rather than optimal, on this
 * reasoning:
 *
 *  - 0.35 (SUSPECTED): roughly what a second corroborating report produces.
 *    Enough to show a responder "something may be happening here", not enough
 *    to act on.
 *  - 0.60 (HIGH_CONFIDENCE): typically needs several reports agreeing across
 *    place, time and severity. Worth a responder's attention now.
 *  - 0.80 (VERIFIED): reachable only when nearly every available component
 *    agrees. This is the ceiling automation is allowed to reach, and it still
 *    does not alert anyone.
 *
 * With one component unavailable, renormalisation means these thresholds keep
 * the same meaning — "this fraction of assessable evidence agrees".
 */
export const THRESHOLDS = {
  SUSPECTED: 0.35,
  HIGH_CONFIDENCE: 0.6,
  VERIFIED: 0.8,
} as const;

/** States automatic scoring is allowed to produce, weakest first. */
export const AUTOMATIC_STATES: IncidentState[] = [
  "UNVERIFIED",
  "SUSPECTED",
  "HIGH_CONFIDENCE",
  "VERIFIED",
];

/** States that require a human decision, always. */
export const HUMAN_ONLY_STATES: IncidentState[] = ["ACTIVE", "RESOLVED"];

export const isHumanOnlyState = (state: IncidentState) => HUMAN_ONLY_STATES.includes(state);

/** Rank within the automatic ladder; -1 for human-only states. */
export const automaticRank = (state: IncidentState) => AUTOMATIC_STATES.indexOf(state);

/** The state a given confidence score corresponds to, ignoring history. */
export function automaticStateForScore(score: number): IncidentState {
  if (score >= THRESHOLDS.VERIFIED) return "VERIFIED";
  if (score >= THRESHOLDS.HIGH_CONFIDENCE) return "HIGH_CONFIDENCE";
  if (score >= THRESHOLDS.SUSPECTED) return "SUSPECTED";
  return "UNVERIFIED";
}

export type AutomaticTransition =
  | { changed: true; from: IncidentState; to: IncidentState; reason: string }
  | { changed: false; reason: string };

/**
 * Decides whether automatic scoring may change this incident's state.
 *
 * Refuses in three cases, each for a different reason:
 *
 *  1. The incident is ACTIVE or RESOLVED. A human owns it now; scoring must
 *     not yank an alert out from under a responder, nor reopen something a
 *     duty officer has closed.
 *  2. A human has already reviewed it (`humanReviewed`). Automation may still
 *     raise the state as more evidence arrives, but must never overrule a
 *     person downward — that would silently undo a human's judgement.
 *  3. The incident came from an official feed. Its confidence is not produced
 *     by the citizen-report formula, so the formula has no business rescoring
 *     it.
 */
export function nextAutomaticState(params: {
  current: IncidentState;
  score: number;
  humanReviewed: boolean;
  isOfficialSource: boolean;
}): AutomaticTransition {
  const { current, score, humanReviewed, isOfficialSource } = params;

  if (isOfficialSource) {
    return { changed: false, reason: "Official-source incidents are not scored by the crowd formula" };
  }

  if (isHumanOnlyState(current)) {
    return { changed: false, reason: `${current} is owned by a human and is not automatically changed` };
  }

  const target = automaticStateForScore(score);
  if (target === current) {
    return { changed: false, reason: `Score ${score.toFixed(2)} keeps the incident at ${current}` };
  }

  if (humanReviewed && automaticRank(target) < automaticRank(current)) {
    return {
      changed: false,
      reason: `Score ${score.toFixed(2)} suggests ${target}, but a human set ${current} and automation does not downgrade`,
    };
  }

  return {
    changed: true,
    from: current,
    to: target,
    reason: `Confidence ${score.toFixed(2)} crossed the threshold for ${target}`,
  };
}

// --- Human transitions -----------------------------------------------------

export const HUMAN_ACTIONS = ["verify", "activate", "resolve", "reject"] as const;
export type HumanAction = (typeof HUMAN_ACTIONS)[number];

export const HUMAN_ACTION_TARGETS: Record<HumanAction, IncidentState> = {
  /** Confirm the incident is real, without alerting anyone. */
  verify: "VERIFIED",
  /** Declare it live and alert people in range. The consequential one. */
  activate: "ACTIVE",
  /** It is over. */
  resolve: "RESOLVED",
  /** It was not real; the backing reports are marked rejected too. */
  reject: "RESOLVED",
};

export type HumanTransitionCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Validates a human-initiated transition. Kept deliberately permissive —
 * a duty officer may need to escalate straight from UNVERIFIED to ACTIVE for
 * something they can see out of the window, and the system should not argue.
 * It only blocks transitions that make no sense.
 *
 * Note the `humanReviewed` case. An incident automation has scored as VERIFIED
 * and an incident a person has confirmed as VERIFIED look identical in the
 * `state` column, but they are not the same thing: only the second one carries
 * a human's judgement, and only the second one stops automation from
 * downgrading it later. So confirming an auto-verified incident is a real
 * action and is allowed; confirming one a person already confirmed is a no-op
 * and is refused.
 */
export function checkHumanTransition(
  current: IncidentState,
  action: HumanAction,
  humanReviewed = false,
): HumanTransitionCheck {
  const target = HUMAN_ACTION_TARGETS[action];

  if (current === "RESOLVED") {
    return { allowed: false, reason: "This incident is already resolved" };
  }
  if (current === target && action !== "reject" && humanReviewed) {
    return { allowed: false, reason: `A person has already marked this incident ${current.toLowerCase()}` };
  }
  return { allowed: true };
}
