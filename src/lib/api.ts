import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Maps thrown errors to responses so route handlers can stay linear.
 * Unexpected errors are logged server-side and reported as a generic 500 —
 * never leak internals to a public reporting endpoint.
 */
export function handleRouteError(error: unknown) {
  if (error instanceof AuthError) return jsonError(error.message, error.status);
  if (error instanceof ZodError) {
    return jsonError("Validation failed", 422, {
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  console.error("[crisislink] unhandled route error:", error);
  return jsonError("Something went wrong", 500);
}
