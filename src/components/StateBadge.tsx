import { STATE_COLORS } from "@/lib/constants";

const LABELS: Record<string, string> = {
  UNVERIFIED: "Unverified",
  SUSPECTED: "Suspected",
  HIGH_CONFIDENCE: "High confidence",
  VERIFIED: "Verified",
  ACTIVE: "Active — alerting",
  RESOLVED: "Resolved",
};

export default function StateBadge({ state }: { state: string }) {
  const color = STATE_COLORS[state] ?? "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {LABELS[state] ?? state}
    </span>
  );
}
