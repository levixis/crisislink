import Link from "next/link";
import Nav from "@/components/Nav";
import NearbyStatus from "@/components/NearbyStatus";
import PushOptIn from "@/components/PushOptIn";
import { getSessionUser } from "@/lib/auth";
import { getMapData } from "@/lib/map-data";

export const dynamic = "force-dynamic";

/**
 * The landing page leads with actions, not the map.
 *
 * The map is empty most of the time — which is the desired state of the world,
 * but a blank rectangle is a poor first screen: it reads as broken rather than
 * calm. So the first thing someone sees is what they can *do*, and a
 * plain-language answer to "is anything happening near me". The map is one tap
 * away for when there is something to look at.
 */
export default async function HomePage() {
  const [data, user] = await Promise.all([getMapData(), getSessionUser()]);
  const privileged = user?.role === "ADMIN" || user?.role === "RESPONDER";
  const activeCount = data.incidents.features.filter(
    (f) => f.properties.state === "ACTIVE",
  ).length;

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {activeCount > 0 ? (
          <Link
            href="/map"
            className="mb-5 flex items-center gap-3 rounded-xl bg-red-700 p-4 text-white shadow ring-1 ring-red-800"
          >
            <span aria-hidden className="text-2xl">⚠️</span>
            <span>
              <span className="block font-semibold">
                {activeCount} active alert{activeCount === 1 ? "" : "s"} in India
              </span>
              <span className="text-sm text-red-50">Confirmed by a responder. Tap for details.</span>
            </span>
          </Link>
        ) : null}

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Report what you can see.
        </h1>
        <p className="mt-1.5 text-slate-600">
          Reports from people nearby are combined and checked against official hazard feeds before
          anything is treated as verified.
        </p>

        <div className="mt-5 grid gap-3">
          <Link
            href="/report"
            className="flex items-center justify-between rounded-2xl bg-red-700 px-5 py-4 text-white shadow-lg ring-1 ring-red-800 transition hover:bg-red-800 active:scale-[0.99]"
          >
            <span>
              <span className="block text-lg font-semibold">Report an incident</span>
              <span className="text-sm text-red-50">Flood, fire, earthquake, collapse…</span>
            </span>
            <span aria-hidden className="text-2xl">→</span>
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/emergency"
              className="rounded-xl bg-white px-4 py-4 ring-1 ring-slate-200 transition hover:ring-slate-400"
            >
              <span aria-hidden className="block text-2xl">📞</span>
              <span className="mt-1 block font-semibold text-slate-900">Emergency numbers</span>
              <span className="text-sm text-slate-500">112 and other helplines</span>
            </Link>
            <Link
              href="/map"
              className="rounded-xl bg-white px-4 py-4 ring-1 ring-slate-200 transition hover:ring-slate-400"
            >
              <span aria-hidden className="block text-2xl">🗺️</span>
              <span className="mt-1 block font-semibold text-slate-900">Open map view</span>
              <span className="text-sm text-slate-500">
                {privileged ? "All of India" : "Your area"}
              </span>
            </Link>
          </div>
        </div>

        <div className="mt-5">
          <NearbyStatus data={data} />
        </div>

        {user ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PushOptIn />
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
            <Link href="/register" className="font-medium text-blue-700 underline">
              Create an account
            </Link>{" "}
            to file reports and get alerts for your area.
          </p>
        )}

        {privileged ? (
          <div className="mt-8 rounded-xl bg-slate-900 p-4 text-white">
            <p className="text-sm font-semibold">Signed in as {user?.role.toLowerCase()}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <Link href="/responder" className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
                Responder queue
              </Link>
              <Link
                href="/admin/incidents"
                className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
              >
                Incident dashboard
              </Link>
              <Link
                href="/admin/analytics"
                className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
              >
                Analytics
              </Link>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}
