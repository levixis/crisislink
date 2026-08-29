import { THRESHOLDS } from "@/lib/verification/state";

/** Score bar with the state thresholds marked, so a number has context. */
export default function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <div className="w-full">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-900 transition-[width]"
          style={{ width: `${pct}%` }}
        />
        {Object.values(THRESHOLDS).map((t) => (
          <span
            key={t}
            aria-hidden
            className="absolute top-0 h-full w-px bg-white/90"
            style={{ left: `${t * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs tabular-nums text-slate-500">
        {pct}% confidence
        <span className="ml-2 text-slate-400">
          thresholds {Object.values(THRESHOLDS).map((t) => `${t * 100}%`).join(" · ")}
        </span>
      </p>
    </div>
  );
}
