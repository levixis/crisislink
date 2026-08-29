import Link from "next/link";

const TABS = [
  { href: "/admin/incidents", label: "Incident queue" },
  { href: "/admin/reports", label: "Raw reports" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/shelters", label: "Shelters" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminTabs({ active }: { active: string }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            tab.href === active
              ? "border-red-700 text-red-800"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
