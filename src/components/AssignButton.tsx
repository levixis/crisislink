"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function AssignButton({
  incidentId,
  mine,
}: {
  incidentId: string;
  mine: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const response = await fetch(`/api/incidents/${incidentId}/assign`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: mine ? "release" : "claim" }),
            });
            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              setError(body.error ?? "Could not update assignment");
              return;
            }
            router.refresh();
          })
        }
        className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
          mine
            ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            : "bg-slate-900 text-white hover:bg-slate-700"
        }`}
      >
        {pending ? "…" : mine ? "Release" : "Take this"}
      </button>
      {error ? <span className="ml-2 text-xs text-amber-700">{error}</span> : null}
    </>
  );
}
