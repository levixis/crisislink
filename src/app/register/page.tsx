import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <h1 className="text-xl font-bold text-slate-900">Create an account</h1>
        <p className="mt-1 text-sm text-slate-600">
          You need an account to file reports, so they can be rate limited and weighted.
          CrisisLink covers India.
        </p>
        <Suspense fallback={null}>
          <AuthForm mode="register" />
        </Suspense>
      </main>
    </>
  );
}
