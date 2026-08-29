// Edge-safe half of auth: JWT minting and verification only, no bcrypt and no
// `next/headers`, so middleware can import it as-is. Cookie handling and
// password hashing live in src/lib/auth.ts (Node runtime only).
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@/generated/prisma/enums";
import { getJwtSecret } from "@/lib/env";

export const SESSION_COOKIE = "crisislink_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
