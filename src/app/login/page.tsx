import { Brand } from "@/components/Brand";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in, Jarvis",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="app-ambient flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand withWordmark={false} />
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Jarvis, Command Center
            </h1>
            <p className="mt-1 text-sm text-muted">
              Sign in to your private workspace. Your data is yours, scoped to your account.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl backdrop-blur">
          <LoginForm initialError={error} />
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          Email + password, secured by Supabase Auth. Row-Level Security keeps every row
          visible only to you.
        </p>
      </div>
    </main>
  );
}
