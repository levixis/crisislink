import AdminTabs from "@/components/AdminTabs";
import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { formatIstDateTime } from "@/lib/india";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

/**
 * Operational analytics, computed from the audit trail rather than from
 * separate instrumentation — every number here is derived from a decision that
 * was actually recorded, so it cannot drift from what happened.
 */
export default async function AnalyticsPage() {
  await requireUser(["ADMIN", "RESPONDER"]);

  const [reportTotal, incidentsByState, alerts, classification, verifyTimes, decisions, daily] =
    await Promise.all([
      prisma.report.count(),
      prisma.incident.groupBy({ by: ["state"], _count: { _all: true } }),
      prisma.alert.aggregate({
        _count: { _all: true },
        _sum: { recipientCount: true, deliveredCount: true },
      }),
      prisma.report.aggregate({
        _count: { _all: true },
        _avg: { aiConfidence: true },
      }),
      // Time from an incident first existing to the moment it first reached
      // VERIFIED, whether automation or a person got it there.
      prisma.$queryRaw<{ avg_seconds: number | null; n: bigint }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (first_verified - i."createdAt"))) AS avg_seconds,
               COUNT(*) AS n
          FROM "Incident" i
          JOIN (
            SELECT "targetId", MIN("createdAt") AS first_verified
              FROM "AuditLog"
             WHERE "targetType" = 'Incident'
               AND ("action" = 'incident.verify'
                    OR ("action" = 'incident.autoTransition' AND "metadata"->>'to' = 'VERIFIED'))
             GROUP BY "targetId"
          ) a ON a."targetId" = i."id"
         WHERE i."source" = 'CITIZEN'`,
      prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
      prisma.$queryRaw<{ day: Date; n: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS n
          FROM "Report"
         WHERE "createdAt" >= now() - interval '14 days'
         GROUP BY 1 ORDER BY 1`,
    ]);

  const classified = await prisma.report.count({ where: { aiClassifiedAt: { not: null } } });
  const mismatches = await prisma.report.count({ where: { aiMatchesType: false } });

  const rejected = decisions.find((d) => d.action === "incident.reject")?._count._all ?? 0;
  const confirmed =
    (decisions.find((d) => d.action === "incident.verify")?._count._all ?? 0) +
    (decisions.find((d) => d.action === "incident.activate")?._count._all ?? 0);
  const humanDecisions = rejected + confirmed;

  const avgVerifySeconds = verifyTimes[0]?.avg_seconds ?? null;
  const verifiedCount = Number(verifyTimes[0]?.n ?? 0);
  const maxDaily = Math.max(1, ...daily.map((d) => Number(d.n)));

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
        <AdminTabs active="/admin/analytics" />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Reports received" value={String(reportTotal)} />
          <Stat
            label="Avg time to verified"
            value={
              avgVerifySeconds === null
                ? "—"
                : avgVerifySeconds < 120
                  ? `${Math.round(avgVerifySeconds)}s`
                  : `${Math.round(avgVerifySeconds / 60)} min`
            }
            note={`across ${verifiedCount} incident${verifiedCount === 1 ? "" : "s"}`}
          />
          <Stat
            label="Rejected by a human"
            value={
              humanDecisions === 0 ? "—" : `${Math.round((rejected / humanDecisions) * 100)}%`
            }
            note={`${rejected} of ${humanDecisions} decisions`}
          />
          <Stat
            label="Alerts sent"
            value={String(alerts._count._all)}
            note={`${alerts._sum.deliveredCount ?? 0} delivered of ${alerts._sum.recipientCount ?? 0} in range`}
          />
        </div>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Reports per day (last 14)</h2>
          {daily.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No reports in the last 14 days.</p>
          ) : (
            <div className="mt-4 flex h-32 items-end gap-1">
              {daily.map((d) => (
                // h-full + justify-end gives the bar a definite parent height
                // to resolve its percentage against; without it the column is
                // auto-height and every bar collapses to nothing.
                <div
                  key={d.day.toISOString()}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <div
                    className="w-full min-h-[2px] rounded-t bg-slate-900"
                    style={{ height: `${(Number(d.n) / maxDaily) * 90}%` }}
                    title={`${formatIstDateTime(d.day)} — ${Number(d.n)}`}
                  />
                  <span className="text-[10px] tabular-nums text-slate-400">{Number(d.n)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Incidents by state</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {incidentsByState.map((s) => (
                <li key={s.state} className="flex justify-between">
                  <span className="text-slate-600">{s.state.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="font-medium tabular-nums">{s._count._all}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Text classification</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li className="flex justify-between">
                <span className="text-slate-600">Reports classified</span>
                <span className="font-medium tabular-nums">
                  {classified} / {classification._count._all}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-600">Type mismatches flagged</span>
                <span className="font-medium tabular-nums">{mismatches}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-600">Mean component value</span>
                <span className="font-medium tabular-nums">
                  {classification._avg.aiConfidence?.toFixed(2) ?? "—"}
                </span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              Unclassified reports are not counted against anything — the component is simply
              dropped from their cluster&apos;s score.
            </p>
          </section>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          &ldquo;Rejected by a human&rdquo; is the closest honest proxy for a false-positive rate:
          it counts clusters a reviewer judged not real, out of all clusters a reviewer decided on.
          It is not a measured ground-truth error rate, and should not be presented as one.
        </p>
      </main>
    </>
  );
}
