import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session";

/**
 * Coarse gate on the dashboard routes so signed-out visitors get a redirect
 * rather than a flash of the admin shell. Every route handler and page
 * re-checks the role server-side with requireUser() — this is convenience,
 * not the access control.
 *
 * Runs on the Edge runtime, hence the jose-only session import: no bcrypt and
 * no `next/headers` in this path.
 */
export default async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await readSessionToken(token) : null;

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  if (user.role === "CITIZEN") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/responder/:path*"],
};
