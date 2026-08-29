/**
 * Ranking for the responder queue: what should someone deal with first?
 *
 * This is a sort, not an optimiser, and that is a deliberate scoping decision
 * rather than a shortcut. A real dispatch optimiser solves an assignment
 * problem over travel time, crew skills, vehicle capacity and road access —
 * none of which this system knows. Dressing a weighted sort up as an
 * "AI-powered allocation engine" would be a claim the code cannot support.
 * What this does is order a list the way a duty officer would, and say why.
 *
 * Two rules, applied in order:
 *
 *  1. STATE FIRST. An incident someone has activated outranks any unverified
 *     one, however dramatic the unverified one looks. Human judgement sorts
 *     above arithmetic — the same principle as the state machine itself.
 *  2. THEN SEVERITY x PEOPLE. Within a state band, `severity × (1 + people in
 *     danger)`. The `1 +` matters: a severe incident with nobody yet reported
 *     trapped must not fall to zero, because "no one has reported being
 *     trapped" is not the same as "no one is trapped".
 *
 * Ties break toward the older incident, so nothing starves at the bottom of
 * the queue while newer arrivals keep jumping it.
 */
import type { IncidentState } from "@/generated/prisma/enums";

/** Lower rank sorts first. Mirrors urgency, not the state machine's order. */
const STATE_RANK: Record<IncidentState, number> = {
  ACTIVE: 0,
  VERIFIED: 1,
  HIGH_CONFIDENCE: 2,
  SUSPECTED: 3,
  UNVERIFIED: 4,
  RESOLVED: 5,
};

export type PrioritisableIncident = {
  state: IncidentState;
  severity: number;
  peopleInDanger: number;
  createdAt: Date;
};

/** Severity × exposure. Higher is more urgent. */
export function urgencyScore(incident: {
  severity: number;
  peopleInDanger: number;
}): number {
  return incident.severity * (1 + incident.peopleInDanger);
}

/** One line of plain English explaining a queue position. */
export function explainPriority(incident: PrioritisableIncident): string {
  const score = urgencyScore(incident);
  const people =
    incident.peopleInDanger > 0
      ? `${incident.peopleInDanger} reported in danger`
      : "none reported in danger";
  return `${incident.state.replace(/_/g, " ").toLowerCase()} · severity ${incident.severity} × (1 + ${incident.peopleInDanger}) = ${score} · ${people}`;
}

/**
 * Comparator for Array.prototype.sort — most urgent first.
 * Exported separately so the ordering can be unit-tested without a database.
 */
export function byPriority(a: PrioritisableIncident, b: PrioritisableIncident): number {
  const stateDelta = STATE_RANK[a.state] - STATE_RANK[b.state];
  if (stateDelta !== 0) return stateDelta;

  const urgencyDelta = urgencyScore(b) - urgencyScore(a);
  if (urgencyDelta !== 0) return urgencyDelta;

  // Oldest first, so nothing starves.
  return a.createdAt.getTime() - b.createdAt.getTime();
}
