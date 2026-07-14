import { Brand } from "@/components/Brand";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in, GOTT",
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
            <h1 className="text-lg font-semibold text-foreground">GOTT</h1>
            <p className="mt-1 text-sm text-muted">Your private command center.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl backdrop-blur">
          <LoginForm initialError={error} />
        </div>
      </div>
    </main>
  );
}
