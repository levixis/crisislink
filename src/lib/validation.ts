import { z } from "zod";
import { DISASTER_TYPES } from "@/lib/constants";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export const reportSchema = z.object({
  disasterType: z.enum(DISASTER_TYPES),
  severity: z.number().int().min(1).max(5),
  description: z.string().trim().min(10, "Describe what you can see").max(2000),
  peopleInDanger: z.number().int().min(0).max(100_000).default(0),
  helpNeeded: z.array(z.string().max(60)).max(10).default([]),
  mediaUrls: z.array(z.url()).max(5).default([]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Browser-reported GPS accuracy in metres.
  accuracy: z.number().positive().max(100_000).nullish(),
  // Client-generated timestamp, so a report drafted while offline keeps the
  // time it was actually written rather than the time it synced.
  clientCreatedAt: z.iso.datetime().nullish(),
  // Idempotency key, so replaying a queued report cannot create duplicates.
  clientId: z.uuid().nullish(),
});

export type ReportInput = z.infer<typeof reportSchema>;
