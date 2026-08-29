import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { getSessionUser } from "@/lib/auth";

export default async function Nav() {
  const user = await getSessionUser();
  const privileged = user?.role === "ADMIN" || user?.role === "RESPONDER";

  return (
    <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-700 text-sm font-bold text-white"
          >
            CL
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900">CrisisLink</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/emergency"
            className="rounded-lg px-2.5 py-1.5 font-medium text-red-700 hover:bg-red-50"
          >
            <span aria-hidden>📞</span>
            <span className="ml-1">Emergency</span>
          </Link>
          <Link href="/map" className="rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">
            Map
          </Link>
          <Link
            href="/report"
            className="hidden rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 sm:block"
          >
            Report
          </Link>
          {privileged ? (
            <>
              <Link
                href="/responder"
                className="hidden rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 sm:block"
              >
                Queue
              </Link>
              <Link
                href="/admin/incidents"
                className="hidden rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 sm:block"
              >
                Dashboard
              </Link>
            </>
          ) : null}
          {user ? (
            <span className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-2">
              <span className="hidden text-xs text-slate-400 md:inline">{user.name}</span>
              <SignOutButton />
            </span>
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
