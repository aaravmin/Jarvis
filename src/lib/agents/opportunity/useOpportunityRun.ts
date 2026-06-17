"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OpportunityKindFilter, OpportunityRunView } from "@/lib/agents/opportunity/types";

export type RunPhase = "idle" | "running" | "done" | "error";

/**
 * Drives an opportunity search from the browser. Mirrors useResearchRun: v1 POSTs and awaits
 * completion (the request is the long-poll), tracks elapsed time, and supports client-side cancel.
 * The same submit(query, kindFilter) signature is what Phase 8 voice will call with a transcript.
 */
export function useOpportunityRun(onDone?: (view: OpportunityRunView) => void) {
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [error, setError] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => () => clearTimer(), []);

  const submit = useCallback(
    async (query: string, kindFilter: OpportunityKindFilter = "all") => {
      if (phase === "running") return;
      setPhase("running");
      setError(undefined);
      setElapsed(0);

      const ac = new AbortController();
      abortRef.current = ac;
      const startedAt = Date.now();
      clearTimer();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);

      try {
        const res = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, kindFilter }),
          signal: ac.signal,
        });
        const data = await res.json();
        clearTimer();
        if (!res.ok) {
          setPhase("error");
          setError(data?.error ?? "Search failed.");
          return;
        }
        setPhase("done");
        onDone?.(data as OpportunityRunView);
      } catch (e) {
        clearTimer();
        if (ac.signal.aborted) {
          setPhase("idle");
          return;
        }
        setPhase("error");
        setError(e instanceof Error ? e.message : "Network error.");
      }
    },
    [phase, onDone],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    clearTimer();
    setPhase("idle");
  }, []);

  return { phase, error, elapsed, submit, cancel };
}
