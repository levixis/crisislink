"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Option = { id: string; label: string };

export default function ResourceAssign({
  resourceId,
  assignedIncidentId,
  incidents,
}: {
  resourceId: string;
  assignedIncidentId: string | null;
  incidents: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(incidentId: string | null) {
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/resources/${resourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not update");
        return;
      }
      router.refresh();
    });
  }

  if (assignedIncidentId) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(null)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "…" : "Release"}
        </button>
        {error ? <span className="text-xs text-amber-700">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue=""
        disabled={pending || incidents.length === 0}
        onChange={(e) => e.target.value && submit(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:opacity-50"
      >
        <option value="">
          {incidents.length === 0 ? "No open incidents" : "Assign to…"}
        </option>
        {incidents.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-amber-700">{error}</span> : null}
    </div>
  );
}
