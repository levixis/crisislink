"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });
      const body = await response.json();
      if (!response.ok) {
        const issue = body.issues?.[0]?.message;
        throw new Error(issue ?? body.error ?? "Something went wrong");
      }
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {isRegister ? (
        <label className="block text-sm font-medium text-slate-900">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
          />
        </label>
      ) : null}

      <label className="block text-sm font-medium text-slate-900">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
        />
      </label>

      <label className="block text-sm font-medium text-slate-900">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 8 : 1}
          className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
        />
        {isRegister ? (
          <span className="mt-1 block text-xs font-normal text-slate-500">
            At least 8 characters.
          </span>
        ) : null}
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-red-700 px-4 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
      >
        {submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-slate-600">
        {isRegister ? "Already have an account? " : "New here? "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-blue-700 underline"
        >
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
