"use client";

import { useActionState, useState } from "react";
import { requestOtp, verifyOtp, type LoginState } from "./actions";

const initial: LoginState = { phase: "idle" };

export default function LoginPage() {
  const [reqState, reqAction, sending] = useActionState(requestOtp, initial);
  const [verState, verAction, verifying] = useActionState(verifyOtp, initial);

  // Local override so user can hit "Use a different email" without losing the
  // server state we already have.
  const [restartKey, setRestartKey] = useState(0);

  // After a request succeeds we show the verify form. If verification fails,
  // verState.phase will be "code_sent" again with an error message; either way
  // we want to render the verify form once we're past the initial step.
  const codePhase =
    reqState.phase === "code_sent" || verState.phase === "code_sent";
  const email =
    reqState.phase === "code_sent"
      ? reqState.email
      : verState.phase === "code_sent"
        ? verState.email
        : "";
  const verifyMessage =
    verState.phase === "code_sent" || verState.phase === "error"
      ? verState.message
      : null;

  if (codePhase && restartKey % 2 === 0) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Enter your sign-in code
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            We sent a sign-in code to <strong>{email}</strong>. Type it below.
          </p>
        </div>

        <form action={verAction} className="flex flex-col gap-4">
          <input type="hidden" name="email" value={email} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Code</span>
            <input
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{4,10}"
              maxLength={10}
              required
              autoFocus
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.3em] focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="12345678"
            />
          </label>

          <button
            type="submit"
            disabled={verifying}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {verifying ? "Signing in..." : "Sign in"}
          </button>

          {verifyMessage ? (
            <p className="text-sm text-red-700 dark:text-red-400">
              {verifyMessage}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setRestartKey((k) => k + 1)}
            className="text-left text-xs text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            ← Use a different email
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          We&rsquo;ll email you a numeric code to sign in.
        </p>
      </div>

      <form action={reqAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Full name</span>
          <input
            name="fullName"
            type="text"
            autoComplete="name"
            required
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">School email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {sending ? "Sending..." : "Email me a sign-in code"}
        </button>

        {reqState.phase === "error" ? (
          <p className="text-sm text-red-700 dark:text-red-400">
            {reqState.message}
          </p>
        ) : null}
      </form>
    </main>
  );
}
