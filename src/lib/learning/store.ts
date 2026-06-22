import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Learn-from-edits. When the user edits a Jarvis-generated output and keeps it, we store the
 * (ai_text, final_text) pair keyed by kind. Future generations of that kind read recent pairs back so
 * Jarvis matches the user's revealed voice and preferences. Everything is per-user and RLS-scoped.
 */

export type StyleExample = { kind: string; context?: string; aiText: string; finalText: string };

/** Save one edit pair. No-op when nothing changed (no edit means nothing to learn from). */
export async function saveStyleExample(supabase: SupabaseClient, userId: string, ex: StyleExample): Promise<void> {
  const ai = (ex.aiText ?? "").trim();
  const final = (ex.finalText ?? "").trim();
  if (!ai || !final || ai === final) return;
  await supabase.from("style_examples").insert({
    user_id: userId,
    kind: ex.kind,
    context: ex.context?.slice(0, 500) ?? null,
    ai_text: ai.slice(0, 8000),
    final_text: final.slice(0, 8000),
  });
}

/** The most recent edit pairs for a kind, newest first. */
export async function recentStyleExamples(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  limit = 3,
): Promise<{ aiText: string; finalText: string }[]> {
  const { data } = await supabase
    .from("style_examples")
    .select("ai_text, final_text")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({ aiText: r.ai_text as string, finalText: r.final_text as string }));
}

/** Render edit pairs as a prompt block that teaches the model the user's revisions. Empty when none. */
export function styleExamplesBlock(examples: { aiText: string; finalText: string }[]): string {
  if (!examples.length) return "";
  const blocks = examples
    .map(
      (e, i) =>
        `Example ${i + 1}\nJarvis wrote:\n${e.aiText.slice(0, 1500)}\n\nThe user revised it to:\n${e.finalText.slice(0, 1500)}`,
    )
    .join("\n\n---\n\n");
  return `HOW THE USER REVISES DRAFTS (study these and match their voice, length, phrasing, greeting/sign-off, and what they add or cut):\n${blocks}`;
}
