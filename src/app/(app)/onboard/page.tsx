import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle, Plug, FolderOpen, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profile";
import { getConnection } from "@/lib/google/store";
import { ProfileForm } from "@/components/manual/ProfileForm";

export const dynamic = "force-dynamic";

/**
 * First-run setup. Jarvis is multi-tenant: every account gets its own data (RLS), its own Google
 * connection, its own profile and documents. This checklist walks a brand-new user through the three
 * things that make Jarvis theirs. New sign-ups land here; anyone can return via the Set up nav item.
 */
export default async function OnboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile, connection, docs] = await Promise.all([
    loadProfile(supabase),
    getConnection(supabase, user.id),
    supabase.from("documents").select("id", { count: "exact", head: true }),
  ]);

  const hasProfile = Boolean(profile?.headline || profile?.lookingFor || profile?.level);
  const hasGoogle = Boolean(connection);
  const docCount = docs.count ?? 0;
  const hasDocs = docCount > 0;
  const done = [hasProfile, hasGoogle, hasDocs].filter(Boolean).length;

  const btn = "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong";
  const linkBtn = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-strong transition-colors hover:bg-surface-3";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Set up Jarvis</h1>
        <p className="mt-1 text-sm text-muted">
          Three quick steps so Jarvis works for you. Your data stays private to your account. {done} of 3 done.
        </p>
      </header>

      <Step n={1} done={hasProfile} title="Tell Jarvis about you" desc="A line or two about who you are and what you want. Jarvis uses it to make every suggestion relevant to you.">
        <ProfileForm defaultOpen />
      </Step>

      <Step n={2} done={hasGoogle} icon={<Plug className="h-4 w-4" />} title="Connect Google" desc="Let Jarvis read your Gmail and Calendar so it can turn email and meetings into tracked tasks. Read-only first; you grant write access later if you want it.">
        {hasGoogle ? (
          <p className="text-sm text-success">Connected{connection?.email ? ` as ${connection.email}` : ""}.</p>
        ) : (
          <a href="/api/connect/google" className={btn}>
            <Plug className="h-4 w-4" /> Connect Google
          </a>
        )}
      </Step>

      <Step n={3} done={hasDocs} icon={<FolderOpen className="h-4 w-4" />} title="Add your resume or documents" desc="Upload a resume, bio, or grant materials. Jarvis reads them to fill application forms and write outreach in your voice.">
        <Link href="/documents" className={linkBtn}>
          <FolderOpen className="h-4 w-4" /> {hasDocs ? `${docCount} uploaded, add more` : "Upload a document"}
        </Link>
      </Step>

      <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm text-muted">{done === 3 ? "You are all set." : "You can finish these any time."}</p>
        <Link href="/today" className={btn}>
          Go to your dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  desc,
  icon,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  desc: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          {done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="text-muted">Step {n}.</span> {icon} {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{desc}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
