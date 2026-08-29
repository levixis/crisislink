import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { EMERGENCY_NUMBERS, PRIMARY, SOURCES } from "@/lib/emergency-numbers";

export const metadata: Metadata = {
  title: "Emergency numbers · CrisisLink",
  description: "Official Indian emergency helpline numbers. Tap to call.",
};

/**
 * Designed for someone who is frightened and in a hurry: one enormous target
 * for 112, everything else secondary, no navigation to think about, and every
 * row is itself a tap-to-call link rather than a number you have to memorise
 * and retype into a dialler.
 */
export default function EmergencyPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Emergency numbers</h1>
        <p className="mt-1 text-sm text-slate-600">
          Official Government of India helplines. Tap any number to call.
        </p>

        <a
          href={`tel:${PRIMARY.number}`}
          className="mt-5 flex items-center gap-4 rounded-2xl bg-red-700 p-5 text-white shadow-lg ring-1 ring-red-800 transition active:scale-[0.99] hover:bg-red-800"
        >
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/15 text-3xl font-bold tabular-nums">
            {PRIMARY.number}
          </span>
          <span>
            <span className="block text-lg font-semibold">{PRIMARY.label}</span>
            <span className="mt-0.5 block text-sm text-red-50">{PRIMARY.detail}</span>
          </span>
        </a>

        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong className="font-semibold">If you are unsure which to call, dial 112.</strong> It
          reaches police, fire and ambulance, and works even from a phone with no SIM.
        </p>

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Specific services
        </h2>
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {EMERGENCY_NUMBERS.map((entry) => (
            <li key={entry.number}>
              <a
                href={`tel:${entry.number}`}
                className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-slate-50 active:bg-slate-100"
              >
                <span className="w-14 shrink-0 text-lg font-bold tabular-nums text-red-700">
                  {entry.number}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{entry.label}</span>
                  <span className="block text-sm text-slate-500">{entry.detail}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-lg bg-slate-100 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Where these come from</p>
          <p className="mt-1">
            Every number on this page is taken from a Government of India source, not from
            CrisisLink&apos;s own data. Some services (108, 1070) differ by state — dial 112 if
            unsure.
          </p>
          <ul className="mt-2 space-y-0.5">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
