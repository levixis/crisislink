import Link from "next/link";
import { notFound } from "next/navigation";
import AdminTabs from "@/components/AdminTabs";
import ConfidenceBar from "@/components/ConfidenceBar";
import IncidentActions from "@/components/IncidentActions";
import Nav from "@/components/Nav";
import StateBadge from "@/components/StateBadge";
import { requireUser } from "@/lib/auth";
import { DISASTER_EMOJI, DISASTER_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { DisasterTypeValue } from "@/lib/constants";
import { formatIstDateTime } from "@/lib/india";
import { timeAgo } from "@/lib/map-types";
import { prisma } from "@/lib/prisma";
import { explainIncident } from "@/lib/verification/pipeline";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser(["ADMIN", "RESPONDER"]);
  const { id } = await params;

  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      verifier: { select: { name: true } },
      reportLinks: {
        orderBy: { createdAt: "asc" },
        include: { report: { include: { user: { select: { name: true } } } } },
      },
    },
  });
  if (!incident) notFound();

  const [confidence, audit] = await Promise.all([
    explainIncident(id),
    prisma.auditLog.findMany({
      where: { targetType: "Incident", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const type = incident.disasterType as DisasterTypeValue;

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Link href="/admin/incidents" className="text-sm text-blue-700 underline">
          ← Back to queue
        </Link>
        <AdminTabs active="/admin/incidents" />

        <header className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              <span aria-hidden>{DISASTER_EMOJI[type]}</span>{" "}
              {incident.title ?? DISASTER_LABELS[type]}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {SEVERITY_LABELS[incident.severity]} · {incident.reportLinks.length} report
              {incident.reportLinks.length === 1 ? "" : "s"} ·{" "}
              {incident.centerLat.toFixed(4)}, {incident.centerLng.toFixed(4)} · radius{" "}
              {(incident.radiusMeters / 1000).toFixed(1)} km
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Created {formatIstDateTime(incident.createdAt)} IST ·{" "}
              {incident.source === "OFFICIAL" ? "official feed" : "citizen reports"}
              {incident.verifier ? ` · last decision by ${incident.verifier.name}` : ""}
            </p>
          </div>
          <StateBadge state={incident.state} />
        </header>

        <div className="mt-4 max-w-md">
          <ConfidenceBar score={incident.confidenceScore} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            {confidence ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Why this score</h2>
                <p className="mt-1 text-xs text-slate-500">
                  <strong className="font-semibold text-slate-700">Evidence × quality.</strong>{" "}
                  Evidence is how much independent support exists and sets the ceiling; quality is
                  whether those reports agree, and can only discount it. Components that cannot be
                  meaningfully computed are excluded from their group rather than counted as zero,
                  so a cluster is never penalised for evidence that does not exist.
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="rounded-md bg-slate-50 px-3 py-2">
                    Evidence{" "}
                    <strong className="tabular-nums">{confidence.evidenceScore.toFixed(2)}</strong>
                  </span>
                  <span className="self-center text-slate-400">×</span>
                  <span className="rounded-md bg-slate-50 px-3 py-2">
                    Quality{" "}
                    <strong className="tabular-nums">{confidence.qualityFactor.toFixed(2)}</strong>
                  </span>
                  <span className="self-center text-slate-400">=</span>
                  <span className="rounded-md bg-slate-900 px-3 py-2 text-white">
                    <strong className="tabular-nums">{confidence.score.toFixed(2)}</strong>
                  </span>
                </div>
                <table className="mt-3 w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="pb-1">Component</th>
                      <th className="pb-1 pl-4 text-right font-medium">Weight</th>
                      <th className="pb-1 pl-4 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  {(["evidence", "quality"] as const).map((group) => (
                    <tbody key={group} className="divide-y divide-slate-100">
                      <tr>
                        <td
                          colSpan={3}
                          className="pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {group === "evidence" ? "Evidence — sets the ceiling" : "Quality — discounts it"}
                        </td>
                      </tr>
                      {confidence.components
                        .filter((c) => c.group === group)
                        .map((c) => (
                          <tr key={c.key} className={c.value === null ? "text-slate-400" : ""}>
                            <td className="py-2">
                              {c.label}
                              <span className="block text-xs text-slate-500">{c.detail}</span>
                            </td>
                            <td className="py-2 pl-4 text-right tabular-nums">
                              {c.value === null ? "—" : c.weight.toFixed(2)}
                            </td>
                            <td className="py-2 pl-4 text-right tabular-nums">
                              {c.value === null ? "n/a" : c.value.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  ))}
                </table>
              </section>
            ) : (
              <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                This incident came from an official feed, so it is not scored by the citizen-report
                confidence formula.
                {incident.externalUrl ? (
                  <>
                    {" "}
                    <a
                      href={incident.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline"
                    >
                      View the source record
                    </a>
                    .
                  </>
                ) : null}
              </section>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Backing reports ({incident.reportLinks.length})
              </h2>
              <ul className="mt-3 space-y-3">
                {incident.reportLinks.map(({ report }) => (
                  <li key={report.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-sm text-slate-800">{report.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {report.user.name} · {SEVERITY_LABELS[report.severity]} ·{" "}
                      {timeAgo(report.createdAt.toISOString())} ·{" "}
                      {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                      {report.peopleInDanger > 0 ? (
                        <span className="ml-1 font-medium text-red-700">
                          · {report.peopleInDanger} in danger
                        </span>
                      ) : null}
                    </p>
                    {report.aiClassifiedAt ? (
                      <p
                        className={`mt-1 text-xs ${
                          report.aiMatchesType === false ? "text-amber-700" : "text-slate-500"
                        }`}
                      >
                        <span className="font-medium">
                          {report.aiMatchesType === false ? "Type mismatch" : "Text checks out"}
                        </span>
                        {typeof report.aiConfidence === "number"
                          ? ` (${report.aiConfidence.toFixed(2)})`
                          : ""}
                        {report.aiReasoning ? ` — ${report.aiReasoning}` : ""}
                        {report.aiModel ? (
                          <span className="text-slate-400"> · {report.aiModel}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </li>
                ))}
                {incident.reportLinks.length === 0 ? (
                  <li className="text-sm text-slate-500">No citizen reports attached.</li>
                ) : null}
              </ul>
            </section>
          </div>

          <div className="space-y-6">
            <IncidentActions incidentId={incident.id} />

            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Audit trail</h2>
              <ul className="mt-3 space-y-2 text-xs">
                {audit.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="font-medium text-slate-800">{entry.action}</p>
                    <p className="text-slate-500">
                      {entry.actor?.name ?? "Automatic scoring"} ·{" "}
                      {formatIstDateTime(entry.createdAt)} IST
                    </p>
                    {entry.metadata ? (
                      <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                        {JSON.stringify(entry.metadata, null, 1)}
                      </pre>
                    ) : null}
                  </li>
                ))}
                {audit.length === 0 ? (
                  <li className="text-slate-500">Nothing recorded yet.</li>
                ) : null}
              </ul>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
