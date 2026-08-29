import { NextResponse } from "next/server";
import { createSessionToken, hashPassword, setSessionCookie } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { name, email, password } = registerSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return jsonError("An account with that email already exists", 409);

    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
      select: { id: true, name: true, email: true, role: true },
    });

    await setSessionCookie(await createSessionToken(user));
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
