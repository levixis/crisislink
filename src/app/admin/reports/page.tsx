import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";
import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { DISASTER_EMOJI, DISASTER_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { DisasterTypeValue } from "@/lib/constants";
import { formatIstDateTime } from "@/lib/india";
import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/map-types";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  CLUSTERED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  SPAM: "bg-amber-100 text-amber-900",
};

export default async function AdminReportsPage() {
  // Middleware already redirected signed-out and citizen users; this is the
  // authoritative check.
  await requireUser(["ADMIN", "RESPONDER"]);

  const [reports, counts] = await Promise.all([
    prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const officialCount = await prisma.incident.count({ where: { source: "OFFICIAL" } });

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">Incoming reports</h1>
          <Link href="/" className="text-sm text-blue-700 underline">
            Back to map
          </Link>
        </div>
        <AdminTabs active="/admin/reports" />

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {counts.map((c) => (
            <span
              key={c.status}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <strong className="font-semibold">{c._count._all}</strong>{" "}
              <span className="text-slate-600">{c.status.toLowerCase()}</span>
            </span>
          ))}
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <strong className="font-semibold">{officialCount}</strong>{" "}
            <span className="text-slate-600">official incidents ingested</span>
          </span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Danger</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {timeAgo(r.createdAt.toISOString())}
                    <span className="block text-xs text-slate-400">
                      {formatIstDateTime(r.createdAt)} IST
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span aria-hidden>{DISASTER_EMOJI[r.disasterType as DisasterTypeValue]}</span>{" "}
                    {DISASTER_LABELS[r.disasterType as DisasterTypeValue]}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {r.severity} · {SEVERITY_LABELS[r.severity]}
                  </td>
                  <td className="max-w-md px-3 py-2">{r.description}</td>
                  <td className="px-3 py-2 text-slate-600">{r.peopleInDanger || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                    {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                    {r.accuracy ? (
                      <span className="block text-slate-400">±{Math.round(r.accuracy)} m</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.user.name}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[r.status] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {r.status.toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))}
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    No reports yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Every accepted report is clustered into an incident. Review and decisions happen on the{" "}
          <Link href="/admin/incidents" className="text-blue-700 underline">
            incident queue
          </Link>
          .
        </p>
      </main>
    </>
  );
}
