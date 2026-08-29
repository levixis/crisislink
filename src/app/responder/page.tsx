import Link from "next/link";
import AssignButton from "@/components/AssignButton";
import ConfidenceBar from "@/components/ConfidenceBar";
import Nav from "@/components/Nav";
import StateBadge from "@/components/StateBadge";
import { requireUser } from "@/lib/auth";
import { DISASTER_EMOJI, DISASTER_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { DisasterTypeValue } from "@/lib/constants";
import { timeAgo } from "@/lib/map-types";
import { byPriority, explainPriority } from "@/lib/priority";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Open citizen incidents with cluster-wide exposure attached.
 *
 * People-in-danger is summed across the cluster's reports rather than taken
 * from any one of them, so the queue ranks on total reported exposure.
 */
async function loadQueue() {
  const rows = await prisma.incident.findMany({
    where: { state: { not: "RESOLVED" }, source: "CITIZEN" },
    include: {
      assignedTo: { select: { id: true, name: true } },
      reportLinks: { select: { report: { select: { peopleInDanger: true } } } },
      _count: { select: { reportLinks: true, resources: true } },
    },
    take: 200,
  });

  return rows.map((i) => ({
    ...i,
    peopleInDanger: i.reportLinks.reduce((sum, l) => sum + l.report.peopleInDanger, 0),
  }));
}

type QueueIncident = Awaited<ReturnType<typeof loadQueue>>[number];

function IncidentCard({
  incident,
  currentUserId,
}: {
  incident: QueueIncident;
  currentUserId: string;
}) {
  const type = incident.disasterType as DisasterTypeValue;
  const mine = incident.assignedToId === currentUserId;

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/admin/incidents/${incident.id}`}
            className="font-medium text-slate-900 hover:underline"
          >
            <span aria-hidden>{DISASTER_EMOJI[type]}</span> {DISASTER_LABELS[type]}
          </Link>
          <p className="mt-0.5 text-sm text-slate-600">
            {SEVERITY_LABELS[incident.severity]} · {incident._count.reportLinks} report
            {incident._count.reportLinks === 1 ? "" : "s"} ·{" "}
            {timeAgo(incident.createdAt.toISOString())}
            {incident._count.resources > 0 ? (
              <> · {incident._count.resources} resource(s) assigned</>
            ) : null}
          </p>
          {/* The queue explains its own ordering — a responder should never
              have to guess why something is at the top. */}
          <p className="mt-1 text-xs text-slate-500">{explainPriority(incident)}</p>
          {incident.assignedTo && !mine ? (
            <p className="mt-1 text-xs font-medium text-blue-700">
              Assigned to {incident.assignedTo.name}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <StateBadge state={incident.state} />
          <AssignButton incidentId={incident.id} mine={mine} />
        </div>
      </div>
      <div className="mt-3 max-w-sm">
        <ConfidenceBar score={incident.confidenceScore} />
      </div>
    </li>
  );
}

export default async function ResponderPage() {
  const user = await requireUser(["RESPONDER", "ADMIN"]);
  const ordered = (await loadQueue()).sort(byPriority);
  const mine = ordered.filter((i) => i.assignedToId === user.id);
  const queue = ordered.filter((i) => i.assignedToId !== user.id);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Responder queue</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ordered by state first, then severity × people reported in danger. Taking an incident
          records that you are dealing with it — it is not a verification decision.
        </p>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-900">
            Assigned to you <span className="font-normal text-slate-500">({mine.length})</span>
          </h2>
          <ul className="mt-3 space-y-2">
            {mine.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} currentUserId={user.id} />
            ))}
            {mine.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Nothing assigned to you. Take something from the queue below.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-slate-900">
            Open queue <span className="font-normal text-slate-500">({queue.length})</span>
          </h2>
          <ul className="mt-3 space-y-2">
            {queue.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} currentUserId={user.id} />
            ))}
            {queue.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Queue is clear.
              </li>
            ) : null}
          </ul>
        </section>
      </main>
    </>
  );
}
