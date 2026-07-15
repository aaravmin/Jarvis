import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profile";
import { getConnection } from "@/lib/google/store";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/manual/ProfileForm";

export const dynamic = "force-dynamic";

/**
 * First-run setup. Otto is multi-tenant: every account gets its own data (RLS), its own Google
 * connection, its own profile and goals. This checklist walks a brand-new user through the three
 * things that make Otto theirs. New sign-ups land here; anyone can return via the Set up nav item.
 */
export default async function OnboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile, connection, goals] = await Promise.all([
    loadProfile(supabase),
    getConnection(supabase, user.id),
    supabase.from("goals").select("id", { count: "exact", head: true }),
  ]);

  const hasProfile = Boolean(profile?.headline || profile?.lookingFor || profile?.level);
  const hasGoogle = Boolean(connection);
  const goalCount = goals.count ?? 0;
  const hasGoals = goalCount > 0;
  const done = [hasProfile, hasGoogle, hasGoals].filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <h1 className="text-base font-semibold tracking-tight text-foreground">Set up Otto</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Three quick steps. {done} of 3 complete.</p>
      </header>

      <Step n={1} done={hasProfile} title="Tell Otto about you" desc="A line or two about who you are and what you want, so every suggestion is relevant to you.">
        <ProfileForm defaultOpen />
      </Step>

      <Step n={2} done={hasGoogle} title="Connect Google (and Notion)" desc="Let Otto read your Gmail and Calendar (read-only) to turn email and meetings into tracked tasks. Notion connects here too.">
        <div className="flex flex-wrap items-center gap-2">
          {hasGoogle ? (
            <p className="text-sm text-success">Connected{connection?.email ? ` as ${connection.email}` : ""}.</p>
          ) : (
            <Button asChild size="sm">
              <a href="/api/connect/google">Connect Google</a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/connections">All connections</Link>
          </Button>
        </div>
      </Step>

      <Step n={3} done={hasGoals} title="Set your goals" desc="Your goals are how Otto decides what matters. Anything in your email or meetings that advances one gets flagged and prioritized.">
        <Button asChild variant="outline" size="sm">
          <Link href="/goals">{hasGoals ? `${goalCount} goal${goalCount === 1 ? "" : "s"} set, add more` : "Add your first goal"}</Link>
        </Button>
      </Step>

      <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
        <p className="text-xs text-muted-foreground">{done === 3 ? "You are all set." : "You can finish these any time."}</p>
        <Button asChild size="sm">
          <Link href="/today">Go to your dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  desc,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-card p-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
            done ? "border-success/50 bg-success/15 text-success" : "border-input text-muted-foreground"
          }`}
        >
          {done ? <Check className="size-3" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
