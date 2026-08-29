import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { getSessionUser } from "@/lib/auth";

export default async function Nav() {
  const user = await getSessionUser();
  const privileged = user?.role === "ADMIN" || user?.role === "RESPONDER";

  return (
    <header className="z-[1100] flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <Link href="/" className="flex items-center gap-2">
        <span aria-hidden className="text-lg">🛟</span>
        <span className="text-base font-bold tracking-tight text-slate-900">CrisisLink</span>
      </Link>

      <nav className="flex items-center gap-4 text-sm">
        <Link href="/report" className="text-slate-600 hover:text-slate-900">
          Report
        </Link>
        {privileged ? (
          <>
            <Link href="/responder" className="text-slate-600 hover:text-slate-900">
              Queue
            </Link>
            <Link href="/admin/incidents" className="text-slate-600 hover:text-slate-900">
              Dashboard
            </Link>
          </>
        ) : null}
        {user ? (
          <>
            <span className="hidden text-slate-400 sm:inline">{user.name}</span>
            <SignOutButton />
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
