import AdminTabs from "@/components/AdminTabs";
import Nav from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SheltersPage() {
  await requireUser(["ADMIN", "RESPONDER"]);
  const shelters = await prisma.shelter.findMany({ orderBy: { name: "asc" } });

  const totalCapacity = shelters.reduce((sum, s) => sum + s.capacity, 0);
  const totalOccupancy = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Shelters</h1>
        <AdminTabs active="/admin/shelters" />

        <p className="mt-4 text-sm text-slate-600">
          {shelters.filter((s) => s.isOpen).length} open ·{" "}
          {totalCapacity - totalOccupancy} spaces free of {totalCapacity}
        </p>

        <ul className="mt-4 space-y-2">
          {shelters.map((s) => {
            const free = s.capacity - s.currentOccupancy;
            const pct = s.capacity > 0 ? (s.currentOccupancy / s.capacity) * 100 : 0;
            return (
              <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-900">{s.name}</span>
                  <span className="text-sm text-slate-600">
                    {free} free of {s.capacity}
                    {!s.isOpen ? <span className="ml-2 text-red-700">closed</span> : null}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${pct > 90 ? "bg-red-600" : pct > 70 ? "bg-amber-500" : "bg-green-600"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Occupancy is maintained by hand. Seeded as sample inventory — unlike incidents, there is
          no public feed for a district&apos;s shelter list.
        </p>
      </main>
    </>
  );
}
