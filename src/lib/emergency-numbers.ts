/**
 * Official Indian emergency numbers.
 *
 * SOURCES — every number here comes from a Government of India page, not from
 * memory or a blog. Verify before changing anything:
 *   - https://www.incredibleindia.gov.in/en/emergency  (Ministry of Tourism)
 *   - https://112.gov.in/about                         (ERSS, Ministry of Home Affairs)
 *   - https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss
 *
 * A wrong number on this page is worse than no page at all: someone dials it
 * in an emergency and loses the seconds that mattered. If you cannot source a
 * number to a government page, leave it out.
 *
 * Numbers vary by state for some services (108 and 1070 in particular), so the
 * page tells people to dial 112 when unsure rather than guessing.
 */

export type EmergencyNumber = {
  number: string;
  label: string;
  detail: string;
};

/** The one number that reaches everything. Shown alone, above the rest. */
export const PRIMARY: EmergencyNumber = {
  number: "112",
  label: "All emergencies",
  detail:
    "India's single emergency number (ERSS). Reaches police, fire and ambulance. Works from any phone, including one with no SIM or a locked keypad.",
};

export const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { number: "101", label: "Fire", detail: "Fire and rescue services." },
  { number: "102", label: "Ambulance", detail: "Government ambulance service." },
  {
    number: "108",
    label: "Disaster & emergency response",
    detail: "Emergency response and ambulance in most states. Used for disaster response.",
  },
  { number: "100", label: "Police", detail: "Being merged into 112, but still active." },
  {
    number: "1078",
    label: "National disaster control room",
    detail: "National Disaster Management control room.",
  },
  {
    number: "1070",
    label: "State disaster helpline",
    detail: "State relief commissioner. Some states use 1079 instead.",
  },
  { number: "1092", label: "Earthquake helpline", detail: "Earthquake-specific assistance." },
  { number: "1073", label: "Road accident", detail: "Highway and road accident response." },
  { number: "1071", label: "Air accident", detail: "Aviation emergencies." },
  { number: "1322", label: "Railway security", detail: "Indian Railways security helpline." },
  { number: "104", label: "Medical helpline", detail: "Health advice and medical guidance." },
  { number: "1091", label: "Women in distress", detail: "Women's helpline." },
  { number: "1098", label: "Childline", detail: "Help for children in danger or distress." },
  { number: "1363", label: "Tourist helpline", detail: "Assistance for travellers." },
];

export const SOURCES = [
  { label: "Ministry of Tourism — emergency numbers", url: "https://www.incredibleindia.gov.in/en/emergency" },
  { label: "ERSS 112 — Ministry of Home Affairs", url: "https://112.gov.in/about" },
];
