"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { HumanAction } from "@/lib/verification/state";

type ActionSpec = {
  action: HumanAction;
  label: string;
  className: string;
  /** Activation alerts real people, so it asks twice and says what it will do. */
  confirm?: string;
};

const ACTIONS: ActionSpec[] = [
  {
    action: "verify",
    label: "Confirm real",
    className: "bg-slate-900 text-white hover:bg-slate-700",
  },
  {
    action: "activate",
    label: "Activate & alert",
    className: "bg-red-700 text-white hover:bg-red-800",
    confirm:
      "This sends an alert to every user inside the incident radius. Click again to confirm.",
  },
  {
    action: "resolve",
    label: "Mark resolved",
    className: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  },
  {
    action: "reject",
    label: "Reject as false",
    className: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  },
];

export default function IncidentActions({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState<HumanAction | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(spec: ActionSpec) {
    if (spec.confirm && armed !== spec.action) {
      setArmed(spec.action);
      setError(null);
      return;
    }
    setArmed(null);
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: spec.action, note: note.trim() || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not apply that action");
        return;
      }
      setNote("");
      router.refresh();
    });
  }

  const armedSpec = ACTIONS.find((a) => a.action === armed);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Decision</h2>
      <p className="mt-1 text-xs text-slate-500">
        Automatic scoring can raise an incident as far as verified. Everything below is a human
        decision and is recorded against your account.
      </p>

      <label className="mt-3 block text-xs font-medium text-slate-700">
        Note (optional, saved to the audit log)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Confirmed by phone with the ward office"
          className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((spec) => (
          <button
            key={spec.action}
            type="button"
            disabled={pending}
            onClick={() => run(spec)}
            className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${
              armed === spec.action ? "bg-red-900 text-white ring-2 ring-red-300" : spec.className
            }`}
          >
            {armed === spec.action ? "Confirm alert" : spec.label}
          </button>
        ))}
      </div>

      {armedSpec?.confirm ? (
        <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {armedSpec.confirm}{" "}
          <button
            type="button"
            onClick={() => setArmed(null)}
            className="font-semibold underline"
          >
            Cancel
          </button>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}
