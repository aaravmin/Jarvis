import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoalEntityType } from "@/lib/goals/types";
import type { GoalDigest } from "@/lib/goals/generate";

/** Accepted goals as digests for the AI flows (the model references these ids only). */
export async function loadGoalDigests(supabase: SupabaseClient): Promise<GoalDigest[]> {
  const { data } = await supabase
    .from("goals")
    .select("id, title, description")
    .eq("review_status", "accepted");
  return (data ?? []).map((g) => ({ id: g.id, title: g.title, description: g.description ?? undefined }));
}

/** A compact natural-language description of one entity, for the goal-linking / intersection flows. */
export async function entityFacts(
  supabase: SupabaseClient,
  entityType: GoalEntityType,
  entityId: string,
): Promise<{ facts: string; label: string } | null> {
  if (entityType === "contact") {
    const { data } = await supabase
      .from("contacts")
      .select("full_name, company, role_title, background, relevance, the_ask")
      .eq("id", entityId)
      .maybeSingle();
    if (!data) return null;
    const facts = [
      `Person: ${data.full_name}`,
      data.role_title && `Role: ${data.role_title}`,
      data.company && `Company: ${data.company}`,
      data.background && `Background: ${data.background}`,
      data.relevance && `Relevance: ${data.relevance}`,
      data.the_ask && `The ask: ${data.the_ask}`,
    ].filter(Boolean).join("\n");
    return { facts, label: data.full_name };
  }
  if (entityType === "opportunity") {
    const { data } = await supabase
      .from("opportunities")
      .select("title, organization, category, description, requirements")
      .eq("id", entityId)
      .maybeSingle();
    if (!data) return null;
    const facts = [
      `Opportunity: ${data.title}`,
      data.organization && `Org: ${data.organization}`,
      data.category && `Type: ${data.category}`,
      data.description && `About: ${data.description}`,
      data.requirements && `Requirements: ${data.requirements}`,
    ].filter(Boolean).join("\n");
    return { facts, label: data.title };
  }
  if (entityType === "item") {
    const { data } = await supabase.from("items").select("title, item_type, reasoning").eq("id", entityId).maybeSingle();
    if (!data) return null;
    const facts = [`${data.item_type}: ${data.title}`, data.reasoning && `Why: ${data.reasoning}`].filter(Boolean).join("\n");
    return { facts, label: data.title };
  }
  // source: email / meeting / calendar
  const { data } = await supabase.from("sources").select("title, source_type, raw_text").eq("id", entityId).maybeSingle();
  if (!data) return null;
  const facts = [`${data.source_type}: ${data.title ?? "(untitled)"}`, data.raw_text && `Content: ${String(data.raw_text).slice(0, 2000)}`]
    .filter(Boolean)
    .join("\n");
  return { facts, label: data.title ?? data.source_type };
}
