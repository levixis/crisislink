import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
        <Suspense fallback={null}>
          <AuthForm mode="login" />
        </Suspense>
      </main>
    </>
  );
}
