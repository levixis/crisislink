import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie, verifyPassword } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { email, password } = loginSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email } });

    // Same message and roughly the same work either way, so the response
    // doesn't reveal whether an account exists.
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) return jsonError("Incorrect email or password", 401);

    const session = { id: user.id, name: user.name, email: user.email, role: user.role };
    await setSessionCookie(await createSessionToken(session));
    return NextResponse.json({ user: session });
  } catch (error) {
    return handleRouteError(error);
  }
}
