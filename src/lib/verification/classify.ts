/**
 * Step 4 of the verification pipeline: does the report's own words actually
 * describe the disaster the reporter selected from the dropdown?
 *
 * This is a single structured-output call per report, run once at intake and
 * stored on the row. It feeds the `llmClassification` component of the
 * confidence formula, which is a QUALITY signal — it can discount a cluster
 * whose text does not match its claimed type, but it can never manufacture
 * evidence that more people reported something.
 *
 * OPTIONAL BY DESIGN
 * ------------------
 * With no GEMINI_API_KEY set, classification is skipped, `aiConfidence` stays
 * null, and the scorer drops the component and renormalises. The pipeline is
 * fully correct without it — this is a signal, not a dependency.
 *
 * PRIVACY — READ BEFORE CHANGING WHAT IS SENT
 * -------------------------------------------
 * Google's terms for the FREE tier state that submitted content is used to
 * "provide, improve, and develop Google products", that "human reviewers may
 * read, annotate, and process your API input and output", and explicitly:
 * "Do not submit sensitive, confidential, or personal information to the
 * Unpaid Services."
 *
 * So this call sends the minimum that the question requires: the description
 * text and the claimed disaster type. It deliberately does NOT send the
 * reporter's name, email or id, the coordinates, the GPS accuracy, the
 * people-in-danger count, or the incident it belongs to. Do not add them.
 *
 * A citizen's free-text description can still contain personal information
 * that the reporter chose to include, and this code cannot detect that. For a
 * scoped prototype that is an accepted, disclosed limitation. For anything
 * real it is a blocker: use the paid tier (whose terms exclude training use)
 * or a locally hosted model.
 */
import { GoogleGenAI } from "@google/genai";
import type { DisasterType } from "@/generated/prisma/enums";
import { DISASTER_LABELS, type DisasterTypeValue } from "@/lib/constants";

/**
 * Overridable because model availability changes and is account-dependent:
 * older ids stay alive for existing users but 404 for new keys with
 * "no longer available to new users". Check what your key can actually reach
 * at https://aistudio.google.com/rate-limit before pinning a different one.
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

/** Report intake must not hang on a slow classifier. */
const TIMEOUT_MS = 8_000;

export type Classification = {
  matchesClaimedType: boolean;
  /** The model's own confidence that the text describes the claimed type. */
  confidence: number;
  estimatedSeverity: number;
  /** False for gibberish, jokes, tests, or text describing nothing at all. */
  plausible: boolean;
  reasoning: string;
  model: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    matchesClaimedType: {
      type: "boolean",
      description: "Does the description describe the claimed disaster type?",
    },
    confidence: {
      type: "number",
      description: "0 to 1. How confident are you in matchesClaimedType?",
    },
    estimatedSeverity: {
      type: "integer",
      description: "Severity the text implies, 1 (minor) to 5 (catastrophic).",
    },
    plausible: {
      type: "boolean",
      description: "False for gibberish, jokes, tests, or empty descriptions.",
    },
    reasoning: {
      type: "string",
      description: "One short sentence explaining the judgement.",
    },
  },
  required: ["matchesClaimedType", "confidence", "estimatedSeverity", "plausible", "reasoning"],
} as const;

const SYSTEM_INSTRUCTION = `You triage citizen disaster reports for an emergency platform in India.

You are given a short description written by a member of the public and the disaster type they selected. Judge only whether the words describe that type of event, and how severe the words suggest it is.

Rules:
- Judge the text as written. Do not speculate about what the reporter might have meant.
- A vague but plausible report is still plausible. Fear, confusion and poor grammar are normal under stress and are not grounds to mark something implausible.
- Mark plausible=false only for text that describes no event at all: gibberish, tests, jokes, or advertising.
- If the text describes a real event but a different type than claimed, set matchesClaimedType=false with high confidence, and say which type it sounds like in the reasoning.
- Never invent details that are not in the text.`;

/** Lazily constructed so an unset key is a skip, not a crash at import time. */
function getClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  return new GoogleGenAI({});
}

/**
 * Classifies one report. Returns null when classification is unavailable —
 * no key configured, the call failed, or the response was unusable. Callers
 * treat null as "component unavailable", never as a negative signal.
 */
export async function classifyReport(input: {
  disasterType: DisasterType;
  description: string;
}): Promise<Classification | null> {
  const client = getClient();
  if (!client) return null;

  const label = DISASTER_LABELS[input.disasterType as DisasterTypeValue] ?? input.disasterType;

  try {
    const interaction = await client.interactions.create(
      {
        model: MODEL,
        system_instruction: SYSTEM_INSTRUCTION,
        // Only the claim and the words. See the privacy note above.
        input: `Claimed disaster type: ${label}\n\nDescription written by the reporter:\n"""\n${input.description}\n"""`,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: RESPONSE_SCHEMA,
        },
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    const raw = interaction.output_text;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Classification>;
    if (
      typeof parsed.matchesClaimedType !== "boolean" ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.plausible !== "boolean"
    ) {
      console.warn("[crisislink] classifier returned an unusable shape:", raw.slice(0, 200));
      return null;
    }

    return {
      matchesClaimedType: parsed.matchesClaimedType,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      estimatedSeverity: Math.min(5, Math.max(1, Math.round(parsed.estimatedSeverity ?? 3))),
      plausible: parsed.plausible,
      reasoning: (parsed.reasoning ?? "").slice(0, 500),
      model: MODEL,
    };
  } catch (cause) {
    // Never let the classifier break report intake.
    console.error("[crisislink] report classification failed:", cause);
    return null;
  }
}

/**
 * Collapses a classification into the 0-1 value the confidence formula wants.
 *
 * Kept separate from the API call so the mapping is pure and testable, and so
 * the policy decision — how much a type mismatch should hurt — lives in one
 * readable place rather than inside a prompt.
 */
export function classificationToComponentValue(c: Classification): number {
  // Text that describes no event at all is worthless as corroboration.
  if (!c.plausible) return 0;

  // A real-sounding event of the wrong type is weak support for THIS claim,
  // but not zero: the reporter may have picked the wrong dropdown option for
  // something genuinely happening. The clusterer will have grouped it by the
  // claimed type, so a human should look.
  if (!c.matchesClaimedType) return 0.15 * (1 - c.confidence) + 0.05;

  return c.confidence;
}
