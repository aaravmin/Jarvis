import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectionType, EmailTemplate, GeneralizedTemplate, ProposedConnectionType, TemplateSource } from "./types";

/**
 * CRUD for connection types + email templates. Supabase is the system of record (hard rule #1); RLS
 * scopes every row to the signed-in user. We never write the personal connection detail here — only
 * generalized templates and types reach this layer.
 */

type ConnectionTypeRow = {
  id: string;
  label: string;
  description: string | null;
  guidance: string | null;
  times_used: number;
};

function rowToConnectionType(r: ConnectionTypeRow): ConnectionType {
  return {
    id: r.id,
    label: r.label,
    description: r.description ?? undefined,
    guidance: r.guidance ?? undefined,
    timesUsed: r.times_used ?? 0,
  };
}

export async function listConnectionTypes(supabase: SupabaseClient, userId: string): Promise<ConnectionType[]> {
  const { data } = await supabase
    .from("connection_types")
    .select("id, label, description, guidance, times_used")
    .eq("user_id", userId)
    .order("times_used", { ascending: false })
    .order("label", { ascending: true });
  return ((data as ConnectionTypeRow[] | null) ?? []).map(rowToConnectionType);
}

export async function getConnectionType(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<ConnectionType | null> {
  const { data } = await supabase
    .from("connection_types")
    .select("id, label, description, guidance, times_used")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToConnectionType(data as ConnectionTypeRow) : null;
}

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  placeholders: string[] | null;
  source: TemplateSource | null;
  connection_type_id: string | null;
  drive_file_id: string | null;
  times_used: number | null;
  // Supabase types a many-to-one embed as an array; normalize either shape.
  connection_types?: { label: string }[] | { label: string } | null;
};

function rowToTemplate(r: TemplateRow): EmailTemplate {
  const ct = Array.isArray(r.connection_types) ? r.connection_types[0] : r.connection_types;
  return {
    id: r.id,
    name: r.name,
    subject: r.subject ?? undefined,
    body: r.body,
    placeholders: r.placeholders ?? [],
    source: r.source ?? "user",
    connectionTypeId: r.connection_type_id ?? undefined,
    connectionTypeLabel: ct?.label ?? undefined,
    driveFileId: r.drive_file_id ?? undefined,
    timesUsed: r.times_used ?? 0,
  };
}

export async function listTemplates(supabase: SupabaseClient, userId: string): Promise<EmailTemplate[]> {
  const { data } = await supabase
    .from("email_templates")
    .select("id, name, subject, body, placeholders, source, connection_type_id, drive_file_id, times_used, connection_types(label)")
    .eq("user_id", userId)
    .order("times_used", { ascending: false })
    .order("name", { ascending: true });
  return ((data as TemplateRow[] | null) ?? []).map(rowToTemplate);
}

export async function getTemplate(supabase: SupabaseClient, userId: string, id: string): Promise<EmailTemplate | null> {
  const { data } = await supabase
    .from("email_templates")
    .select("id, name, subject, body, placeholders, source, connection_type_id, drive_file_id, times_used, connection_types(label)")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToTemplate(data as TemplateRow) : null;
}

/**
 * Find a connection type by case-insensitive label, or create it. On a hit we enrich any blank
 * description/guidance fields (without clobbering existing copy) so the type sharpens over time.
 */
async function upsertConnectionType(
  supabase: SupabaseClient,
  userId: string,
  ct: ProposedConnectionType,
): Promise<string> {
  const label = ct.label.trim();
  const { data: existing } = await supabase
    .from("connection_types")
    .select("id, description, guidance")
    .eq("user_id", userId)
    .ilike("label", label)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, string> = {};
    if (!existing.description && ct.description?.trim()) patch.description = ct.description.trim();
    if (!existing.guidance && ct.guidance?.trim()) patch.guidance = ct.guidance.trim();
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await supabase.from("connection_types").update(patch).eq("user_id", userId).eq("id", existing.id);
    }
    return existing.id as string;
  }

  const { data: inserted, error } = await supabase
    .from("connection_types")
    .insert({
      user_id: userId,
      label,
      description: ct.description?.trim() || null,
      guidance: ct.guidance?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save connection type: ${error.message}`);
  return inserted.id as string;
}

/**
 * Persist a generalized template + its connection type. The personal detail never reaches this
 * function — callers pass only the scrubbed, reusable artifact (autonomy L0: the user approves first).
 */
export async function saveGeneralizedTemplate(
  supabase: SupabaseClient,
  userId: string,
  args: { connectionType: ProposedConnectionType; template: GeneralizedTemplate },
): Promise<{ templateId: string; connectionTypeId: string }> {
  const connectionTypeId = await upsertConnectionType(supabase, userId, args.connectionType);

  const { data, error } = await supabase
    .from("email_templates")
    .insert({
      user_id: userId,
      name: args.template.name.trim() || `${args.connectionType.label} outreach`,
      subject: args.template.subject?.trim() || null,
      body: args.template.body,
      placeholders: args.template.placeholders ?? [],
      source: "jarvis",
      connection_type_id: connectionTypeId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save template: ${error.message}`);

  await supabase
    .from("connection_types")
    .update({ times_used: (await typeUsage(supabase, userId, connectionTypeId)) + 1, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", connectionTypeId);

  return { templateId: data.id as string, connectionTypeId };
}

async function typeUsage(supabase: SupabaseClient, userId: string, id: string): Promise<number> {
  const { data } = await supabase
    .from("connection_types")
    .select("times_used")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return (data?.times_used as number | null) ?? 0;
}

export async function deleteTemplate(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  await supabase.from("email_templates").delete().eq("user_id", userId).eq("id", id);
}

export async function deleteConnectionType(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  await supabase.from("connection_types").delete().eq("user_id", userId).eq("id", id);
}
