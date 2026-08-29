import Nav from "@/components/Nav";
import ReportForm from "@/components/ReportForm";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  // Reports are attributed to an account: it is what makes rate limiting and
  // (from Phase 2) reporter trust weighting possible.
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/report");

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-slate-900">Report an incident</h1>
        <p className="mt-1 text-sm text-slate-600">
          Report only what you can see yourself. Your report is combined with others nearby
          before anything is treated as verified.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          CrisisLink currently covers locations within India.
        </p>
        <ReportForm />
      </main>
    </>
  );
}
