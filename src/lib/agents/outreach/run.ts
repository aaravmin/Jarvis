import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeOutreach, type OutreachContact } from "./compose";
import type { Audience, OutreachRunResult, OutreachRunStatus, OutreachRunView } from "./types";
import { loadProfile, profileDigest } from "@/lib/profile";
import { getTemplate } from "@/lib/templates/store";

/**
 * Run-and-persist for the Outreach agent. Loads the contact (incl. current_work and how the user knows
 * them), branches tone on the audience, drafts with Grok, and saves the draft to outreach_runs
 * (status 'drafted'). Saving the draft into Gmail is a separate, user-initiated step (drafts only).
 */

type ContactRow = {
  full_name: string;
  company: string | null;
  role_title: string | null;
  background: string | null;
  relevance: string | null;
  current_work: string | null;
};

/** Load a contact's email (prefer the primary) + the connection note for the email's context. */
async function loadContact(
  supabase: SupabaseClient,
  userId: string,
  contactId: string,
): Promise<{ contact: OutreachContact; email?: string } | null> {
  const { data: c } = await supabase
    .from("contacts")
    .select("full_name, company, role_title, background, relevance, current_work")
    .eq("user_id", userId)
    .eq("id", contactId)
    .maybeSingle<ContactRow>();
  if (!c) return null;

  const [{ data: channels }, { data: conn }] = await Promise.all([
    supabase.from("contact_channels").select("kind, value, is_primary").eq("contact_id", contactId),
    supabase.from("connections").select("relationship_note").eq("contact_id", contactId).maybeSingle(),
  ]);
  const emails = (channels ?? []).filter((ch) => ch.kind === "email");
  const email = (emails.find((e) => e.is_primary) ?? emails[0])?.value as string | undefined;

  return {
    email,
    contact: {
      name: c.full_name,
      email,
      roleTitle: c.role_title ?? undefined,
      company: c.company ?? undefined,
      currentWork: c.current_work ?? undefined,
      relevance: c.relevance ?? undefined,
      background: c.background ?? undefined,
      connectionNote: (conn?.relationship_note as string | undefined) ?? undefined,
    },
  };
}

function toView(row: {
  id: string;
  contact_id: string | null;
  audience: Audience;
  goal: string | null;
  template_id: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  gmail_draft_id: string | null;
  status: OutreachRunStatus;
  error: string | null;
  created_at: string;
}, extra: { contactName?: string; contactEmail?: string }): OutreachRunView {
  return {
    id: row.id,
    contactId: row.contact_id ?? undefined,
    contactName: extra.contactName,
    contactEmail: extra.contactEmail,
    audience: row.audience,
    goal: row.goal ?? undefined,
    templateId: row.template_id ?? undefined,
    draftSubject: row.draft_subject ?? undefined,
    draftBody: row.draft_body ?? undefined,
    gmailDraftId: row.gmail_draft_id ?? undefined,
    status: row.status,
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

export async function runOutreach(
  supabase: SupabaseClient,
  userId: string,
  opts: { contactId?: string; audience: Audience; goal?: string; templateId?: string },
): Promise<OutreachRunResult> {
  const { data: run, error: runErr } = await supabase
    .from("outreach_runs")
    .insert({
      user_id: userId,
      contact_id: opts.contactId ?? null,
      audience: opts.audience,
      goal: opts.goal ?? null,
      template_id: opts.templateId ?? null,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Could not create outreach run.");
  const runId = run.id as string;

  try {
    if (!opts.contactId) throw new Error("Pick a contact to write to.");
    const loaded = await loadContact(supabase, userId, opts.contactId);
    if (!loaded) throw new Error("That contact no longer exists.");

    const [profile, template] = await Promise.all([
      loadProfile(supabase),
      opts.templateId ? getTemplate(supabase, userId, opts.templateId) : Promise.resolve(null),
    ]);
    const templateText = template ? `Subject: ${template.subject ?? ""}\n\n${template.body}` : undefined;

    const { subject, body } = await composeOutreach({
      contact: loaded.contact,
      audience: opts.audience,
      goal: opts.goal,
      senderDigest: profileDigest(profile) || undefined,
      templateText,
      instructions: template?.instructions,
    });

    const { data: updated } = await supabase
      .from("outreach_runs")
      .update({
        draft_subject: subject,
        draft_body: body,
        status: "drafted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select(
        "id, contact_id, audience, goal, template_id, draft_subject, draft_body, gmail_draft_id, status, error, created_at",
      )
      .single();
    if (!updated) throw new Error("Failed to save the draft.");

    return {
      status: "done",
      view: toView(updated, { contactName: loaded.contact.name, contactEmail: loaded.email }),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Drafting the outreach failed.";
    await supabase.from("outreach_runs").update({ status: "error", error }).eq("id", runId);
    return { status: "error", runId, error };
  }
}
