"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResearchTarget } from "@/lib/types";
import type { ResearchRunView } from "@/lib/research/types";

export type RunPhase = "idle" | "running" | "done" | "error";

/**
 * Drives a cohort research run from the browser. v1 POSTs and awaits completion (the request is the
 * long-poll), tracking an elapsed timer and supporting client-side cancel. The same submit(query)
 * signature is what Phase 8 voice will call with a speech transcript — no rewrite.
 */
export function useResearchRun(onDone?: (view: ResearchRunView) => void) {
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
    async (query: string, target: ResearchTarget = "people") => {
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
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target, query }),
          signal: ac.signal,
        });
        const data = await res.json();
        clearTimer();
        if (!res.ok) {
          setPhase("error");
          setError(data?.error ?? "Research failed.");
          return;
        }
        setPhase("done");
        onDone?.(data as ResearchRunView);
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
