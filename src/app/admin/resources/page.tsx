import AdminTabs from "@/components/AdminTabs";
import Nav from "@/components/Nav";
import ResourceAssign from "@/components/ResourceAssign";
import { requireUser } from "@/lib/auth";
import { DISASTER_LABELS, SEVERITY_LABELS } from "@/lib/constants";
import type { DisasterTypeValue } from "@/lib/constants";
import { byPriority, explainPriority } from "@/lib/priority";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  AMBULANCE: "Ambulance",
  RESCUE_TEAM: "Rescue team",
  BOAT: "Boat",
  FIRE_ENGINE: "Fire engine",
  MEDICAL_SUPPLIES: "Medical supplies",
  FOOD_WATER: "Food & water",
  HEAVY_EQUIPMENT: "Heavy equipment",
};

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  DEPLOYED: "bg-amber-100 text-amber-900",
  UNAVAILABLE: "bg-slate-100 text-slate-600",
};

export default async function ResourcesPage() {
  await requireUser(["ADMIN", "RESPONDER"]);

  const [resources, incidentRows] = await Promise.all([
    prisma.resource.findMany({
      orderBy: [{ status: "asc" }, { type: "asc" }],
      include: { assignedIncident: { select: { id: true, disasterType: true, severity: true } } },
    }),
    prisma.incident.findMany({
      where: { state: { not: "RESOLVED" }, source: "CITIZEN" },
      include: { reportLinks: { select: { report: { select: { peopleInDanger: true } } } } },
    }),
  ]);

  // The dropdown lists incidents in the same order the responder queue uses,
  // so the most urgent job is the first thing offered.
  const incidents = incidentRows
    .map((i) => ({
      ...i,
      peopleInDanger: i.reportLinks.reduce((sum, l) => sum + l.report.peopleInDanger, 0),
    }))
    .sort(byPriority);

  const options = incidents.map((i) => ({
    id: i.id,
    label: `${DISASTER_LABELS[i.disasterType as DisasterTypeValue]} · ${SEVERITY_LABELS[i.severity]} · ${explainPriority(i).split(" · ")[1]}`,
  }));

  const available = resources.filter((r) => r.status === "AVAILABLE").length;

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Resources</h1>
        <AdminTabs active="/admin/resources" />

        <p className="mt-4 text-sm text-slate-600">
          {available} of {resources.length} available. Incidents are offered in responder-queue
          order — state first, then severity × people in danger.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          This is a priority sort, not an allocation optimiser: it does not model travel time,
          crew skills or road access, and does not claim to.
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assigned to</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resources.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.label}</td>
                  <td className="px-3 py-2 text-slate-600">{TYPE_LABELS[r.type] ?? r.type}</td>
                  <td className="px-3 py-2 text-slate-600">{r.quantity}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[r.status] ?? "bg-slate-100"
                      }`}
                    >
                      {r.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.assignedIncident
                      ? DISASTER_LABELS[r.assignedIncident.disasterType as DisasterTypeValue]
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ResourceAssign
                      resourceId={r.id}
                      assignedIncidentId={r.assignedIncidentId}
                      incidents={options}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
