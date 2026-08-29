import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import ConfidenceBar from "@/components/ConfidenceBar";
import Nav from "@/components/Nav";
import StateBadge from "@/components/StateBadge";
import { requireUser } from "@/lib/auth";
import { DISASTER_EMOJI, DISASTER_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { DisasterTypeValue } from "@/lib/constants";
import { formatIstDateTime } from "@/lib/india";
import { timeAgo } from "@/lib/map-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Needs-attention first, then most confident. */
const QUEUE_ORDER = ["ACTIVE", "VERIFIED", "HIGH_CONFIDENCE", "SUSPECTED", "UNVERIFIED", "RESOLVED"];

export default async function IncidentQueuePage() {
  await requireUser(["ADMIN", "RESPONDER"]);

  const incidents = await prisma.incident.findMany({
    where: { state: { not: "RESOLVED" } },
    orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { _count: { select: { reportLinks: true } }, verifier: { select: { name: true } } },
  });

  const ordered = [...incidents].sort(
    (a, b) => QUEUE_ORDER.indexOf(a.state) - QUEUE_ORDER.indexOf(b.state),
  );
  const citizen = ordered.filter((i) => i.source === "CITIZEN");
  const official = ordered.filter((i) => i.source === "OFFICIAL");

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Incident queue</h1>
        <AdminTabs active="/admin/incidents" />

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">
            From citizen reports <span className="font-normal text-slate-500">({citizen.length})</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Scored automatically. Only a person can set an incident to active and alert people in range.
          </p>

          <ul className="mt-3 space-y-2">
            {citizen.map((incident) => (
              <li key={incident.id}>
                <Link
                  href={`/admin/incidents/${incident.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">
                      <span aria-hidden>
                        {DISASTER_EMOJI[incident.disasterType as DisasterTypeValue]}
                      </span>{" "}
                      {DISASTER_LABELS[incident.disasterType as DisasterTypeValue]}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        {incident._count.reportLinks} report
                        {incident._count.reportLinks === 1 ? "" : "s"} ·{" "}
                        {SEVERITY_LABELS[incident.severity]} · {timeAgo(incident.createdAt.toISOString())}
                      </span>
                    </span>
                    <StateBadge state={incident.state} />
                  </div>
                  <div className="mt-3 max-w-md">
                    <ConfidenceBar score={incident.confidenceScore} />
                  </div>
                </Link>
              </li>
            ))}
            {citizen.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No open citizen incidents.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">
            From official feeds <span className="font-normal text-slate-500">({official.length})</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Ingested as verified — a seismic network is authoritative for whether the ground shook.
            Still not alerting anyone without a human.
          </p>

          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {official.slice(0, 25).map((incident) => (
              <li key={incident.id}>
                <Link
                  href={`/admin/incidents/${incident.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="text-sm text-slate-800">
                    <span aria-hidden>
                      {DISASTER_EMOJI[incident.disasterType as DisasterTypeValue]}
                    </span>{" "}
                    {incident.title}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    {formatIstDateTime(incident.createdAt)} IST
                    <StateBadge state={incident.state} />
                  </span>
                </Link>
              </li>
            ))}
            {official.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                No official incidents ingested yet. Run <code>npm run poll:usgs</code>.
              </li>
            ) : null}
          </ul>
        </section>
      </main>
    </>
  );
}
