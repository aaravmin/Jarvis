"use client";

import { useActionState } from "react";
import { authenticate, type AuthResult } from "./actions";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(
    authenticate,
    { error: initialError },
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-medium text-muted">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-medium text-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          placeholder="••••••••"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      {state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
          {state.notice}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="submit"
          name="intent"
          value="signin"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "…" : "Sign in"}
        </button>
        <button
          type="submit"
          name="intent"
          value="signup"
          disabled={pending}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-muted-strong transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-60"
        >
          Create account
        </button>
      </div>
    </form>
  );
}
