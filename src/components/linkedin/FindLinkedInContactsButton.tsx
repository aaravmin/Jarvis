"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserSearch, Loader2, ArrowRight } from "lucide-react";

type Props = {
  /** Resolve org+role from a prepared application run… */
  applicationId?: string;
  /** …or from an accepted opportunity… */
  opportunityId?: string;
  /** …or pass a company directly (manual). */
  org?: string;
  className?: string;
};

type ScrapeResult = {
  ok?: boolean;
  needsLogin?: boolean;
  inserted?: number;
  found?: number;
  message?: string;
};

/**
 * "Find LinkedIn contacts", drives the user's logged-in LinkedIn to a People search relevant to a
 * linked job/grant and lands the results in the Review queue. First use opens a login window
 * (needsLogin), the user signs in once, then clicks again. Never connects/messages anyone.
 */
export function FindLinkedInContactsButton({ applicationId, opportunityId, org, className }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "warn"; message: string; review: boolean } | null>(null);

  async function find() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/linkedin/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, opportunityId, org }),
      });
      const data = (await res.json().catch(() => null)) as ScrapeResult | null;
      const inserted = data?.inserted ?? 0;
      setResult({
        tone: data?.ok && inserted > 0 ? "ok" : "warn",
        message: data?.message ?? "Couldn't reach the LinkedIn finder. Make sure JARVIS_BROWSER=playwright is set.",
        review: inserted > 0,
      });
      if (inserted > 0) router.refresh();
    } catch {
      setResult({ tone: "warn", message: "Couldn't reach the LinkedIn finder service.", review: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void find()}
        disabled={busy}
        title="Search LinkedIn (your own logged-in session) for people at this organization and add them to Review. Jarvis never connects or messages anyone."
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#0a66c2]/40 bg-[#0a66c2]/10 px-3 py-1.5 text-xs font-semibold text-[#3b8beb] transition-colors hover:bg-[#0a66c2]/20 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserSearch className="h-3.5 w-3.5" />}
        {busy ? "Searching LinkedIn…" : "Find LinkedIn contacts"}
      </button>
      {result && (
        <p className={`mt-2 text-xs leading-relaxed ${result.tone === "ok" ? "text-emerald-400" : "text-amber-400"}`}>
          {result.message}
          {result.review && (
            <Link href="/review" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-accent hover:underline">
              Review them <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
