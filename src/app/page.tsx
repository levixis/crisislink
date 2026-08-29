import Link from "next/link";
import Nav from "@/components/Nav";
import NearbyStatus from "@/components/NearbyStatus";
import PushOptIn from "@/components/PushOptIn";
import { getSessionUser } from "@/lib/auth";
import { getMapData } from "@/lib/map-data";
import { prisma } from "@/lib/prisma";
import { THRESHOLDS } from "@/lib/verification/state";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "1",
    title: "Someone reports what they see",
    body: "A single report is never treated as fact. It is logged, rate-limited, and checked for impossible GPS jumps before it goes anywhere.",
  },
  {
    n: "2",
    title: "Nearby reports are grouped",
    body: "Reports of the same kind within 1 km and 2 hours are clustered into one incident, so five people describing one flood become one flood.",
  },
  {
    n: "3",
    title: "The cluster is scored, and shows its working",
    body: "Evidence × quality: how many independent people reported it, and whether they agree on where, when and how bad. Agreement can discount evidence, never invent it.",
  },
  {
    n: "4",
    title: "A person decides before anyone is alerted",
    body: "Scoring can raise an incident as far as verified. Only a named responder can make it active and send alerts — and that decision is recorded.",
  },
];

export default async function HomePage() {
  const [data, user, reportCount] = await Promise.all([
    getMapData(),
    getSessionUser(),
    prisma.report.count(),
  ]);

  const privileged = user?.role === "ADMIN" || user?.role === "RESPONDER";
  const features = data.incidents.features;
  const activeCount = features.filter((f) => f.properties.state === "ACTIVE").length;
  const officialCount = features.filter((f) => f.properties.source === "OFFICIAL").length;
  const citizenCount = features.length - officialCount;

  return (
    <>
      <Nav />
      <main className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className="border-b border-slate-800 bg-slate-900">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
            {activeCount > 0 ? (
              <Link
                href="/map"
                className="mb-5 inline-flex items-center gap-2 rounded-full bg-red-700 px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-red-500"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                {activeCount} active alert{activeCount === 1 ? "" : "s"} in India →
              </Link>
            ) : (
              <span className="mb-5 inline-flex items-center gap-2 rounded-full bg-slate-800 px-3.5 py-1.5 text-sm text-slate-300 ring-1 ring-slate-700">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                No active alerts right now
              </span>
            )}

            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              Disasters get reported before they get confirmed.
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-300">
              CrisisLink collects what people on the ground can actually see, groups the reports
              that agree, checks them against official hazard feeds — and never sends an alert
              until a real person signs off on it.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/report"
                className="flex items-center justify-between rounded-xl bg-red-700 px-5 py-3.5 font-semibold text-white shadow-lg transition hover:bg-red-600 sm:min-w-56"
              >
                Report an incident
                <span aria-hidden className="ml-3">→</span>
              </Link>
              <Link
                href="/emergency"
                className="flex items-center justify-between rounded-xl bg-white px-5 py-3.5 font-semibold text-slate-900 transition hover:bg-slate-100 sm:min-w-56"
              >
                <span>
                  Emergency numbers
                  <span className="ml-2 font-normal text-slate-500">112</span>
                </span>
                <span aria-hidden className="ml-3">→</span>
              </Link>
            </div>

            <dl className="mt-9 grid grid-cols-3 gap-4 border-t border-slate-800 pt-6">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Official events</dt>
                <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
                  {officialCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Citizen incidents</dt>
                <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
                  {citizenCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Reports received</dt>
                <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
                  {reportCount}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              Live from USGS seismic feeds and citizen reports across India, last 7 days.
            </p>
          </div>
        </section>

        {/* ---------- Your area ---------- */}
        <section className="mx-auto max-w-3xl px-4 py-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your area
          </h2>
          <div className="mt-3">
            <NearbyStatus data={data} />
          </div>
          {user ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <PushOptIn />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              <Link href="/register" className="font-medium text-blue-700 underline">
                Create an account
              </Link>{" "}
              to file reports and get alerts for your area.
            </p>
          )}
        </section>

        {/* ---------- How verification works ---------- */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-10">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Why you can believe what you see here
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Crowdsourced reports are only useful if someone is filtering them. Here is exactly
              what happens between a report arriving and an alert going out — no step is hidden.
            </p>

            <ol className="mt-7 space-y-4">
              {STEPS.map((step) => (
                <li key={step.n} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                    {step.n}
                  </span>
                  <div className="min-w-0 pb-1">
                    <h3 className="font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Confidence thresholds:</span>
              {[
                { label: "Unverified", color: "bg-slate-400", at: "below 35%" },
                { label: "Suspected", color: "bg-amber-500", at: `${THRESHOLDS.SUSPECTED * 100}%` },
                {
                  label: "High confidence",
                  color: "bg-orange-500",
                  at: `${THRESHOLDS.HIGH_CONFIDENCE * 100}%`,
                },
                { label: "Verified", color: "bg-red-600", at: `${THRESHOLDS.VERIFIED * 100}%` },
              ].map((t) => (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700"
                >
                  <span className={`h-2 w-2 rounded-full ${t.color}`} />
                  {t.label} <span className="text-slate-400">{t.at}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- The safety rule ---------- */}
        <section className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
            <h2 className="text-lg font-bold">No machine sends an alert here</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Automatic scoring can take an incident as far as <strong>verified</strong>. It
              cannot take it further. Making an incident <strong>active</strong> — the state that
              puts a notification on strangers&apos; phones — requires a named person, and that
              decision is written to an audit log with who made it and what the score was at the
              time. A false alarm sent to a whole district does more damage than an alert that
              waits ninety seconds for someone to confirm it.
            </p>
          </div>

          {privileged ? (
            <div className="mt-6 rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-sm font-semibold text-slate-900">
                You are signed in as {user?.role.toLowerCase()}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2 text-sm">
                <Link
                  href="/responder"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
                >
                  Responder queue
                </Link>
                <Link
                  href="/admin/incidents"
                  className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-200"
                >
                  Incident dashboard
                </Link>
                <Link
                  href="/admin/analytics"
                  className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-200"
                >
                  Analytics
                </Link>
              </div>
            </div>
          ) : null}
        </section>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500">
            <p>
              CrisisLink — a scoped prototype. Official hazard data from USGS. Not a substitute for
              emergency services.
            </p>
            <Link href="/emergency" className="font-semibold text-red-700 hover:underline">
              Emergency numbers →
            </Link>
          </div>
        </footer>
      </main>
    </>
  );
}
