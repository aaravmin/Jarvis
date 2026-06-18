import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/google/store";
import { listMessageIds, getMessage, gmailLink, type GmailMessage } from "@/lib/google/gmail";
import { listEvents } from "@/lib/google/calendar";
import { loadGoalDigests } from "@/lib/goals/facts";
import { loadProfile, profileDigest } from "@/lib/profile";

/**
 * Gmail + Calendar ingestion. Gmail is triaged by Claude relative to the user's goals/profile: only
 * genuinely important mail is kept (spam/promotions/noise dropped entirely), grouped by sender/org,
 * and important senders / opportunity threads add the sender to Contacts (L0 review). Calendar is kept
 * as-is (no filtering). Everything is stored as `sources` (the provenance anchor), deduped by id.
 */

const DEFAULT_MODEL = "claude-sonnet-4-6";

type Classification = { idx: number; keep: boolean; category: string; group: string; addContact: boolean };

async function relevance(supabase: SupabaseClient): Promise<string> {
  const [profile, goals] = await Promise.all([loadProfile(supabase), loadGoalDigests(supabase)]);
  const parts = [profileDigest(profile)];
  if (goals.length) parts.push(`Goals:\n${goals.map((g) => `- ${g.title}`).join("\n")}`);
  return parts.filter(Boolean).join("\n\n");
}

async function classifyEmails(emails: GmailMessage[], who: string): Promise<Map<number, Classification>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic({ apiKey });
  const list = emails
    .map((e, i) => `[${i}] from: ${e.fromName} <${e.fromEmail}> | subject: ${e.subject} | ${e.snippet.slice(0, 160)}`)
    .join("\n");

  const resp = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 4000,
    system: `You triage a person's inbox. KEEP only genuinely important emails; DROP promotions, marketing, newsletters, social notifications, automated noise, and spam (keep=false for those). For kept emails, GROUP by the sender's organization or person (e.g. "Brown University", "Jane Smith", "YC"). Set add_contact=true when the sender is a real person worth tracking, or the email is a real opportunity/intro. Judge importance relative to the user below.${who ? `\n\n${who}` : ""}`,
    tools: [
      {
        name: "classify_emails",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  idx: { type: "number" },
                  keep: { type: "boolean" },
                  category: { type: "string", enum: ["opportunity", "person", "update", "other"] },
                  group: { type: "string" },
                  add_contact: { type: "boolean" },
                },
                required: ["idx", "keep", "group"],
              },
            },
          },
          required: ["items"],
        },
      } as unknown as Anthropic.Tool,
    ],
    tool_choice: { type: "tool", name: "classify_emails" },
    messages: [{ role: "user", content: `Triage these inbox emails:\n${list}` }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  const block = resp.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  const items = ((block?.input as { items?: Record<string, unknown>[] })?.items ?? []) as Record<string, unknown>[];
  const map = new Map<number, Classification>();
  for (const it of items) {
    const idx = Number(it.idx);
    if (!Number.isInteger(idx)) continue;
    map.set(idx, {
      idx,
      keep: it.keep !== false,
      category: String(it.category ?? "other"),
      group: String(it.group ?? "").trim() || "Other",
      addContact: it.add_contact === true,
    });
  }
  return map;
}

export type GmailIngestResult = { imported: number; contactsAdded: number; groups: { label: string; count: number }[] };

export async function ingestGmail(supabase: SupabaseClient, userId: string): Promise<GmailIngestResult> {
  const token = await getValidAccessToken(supabase, userId);
  const ids = await listMessageIds(token, 40);
  if (!ids.length) return { imported: 0, contactsAdded: 0, groups: [] };

  const emails = (await Promise.all(ids.map((m) => getMessage(token, m.id).catch(() => null)))).filter(
    (e): e is GmailMessage => e !== null,
  );

  const who = await relevance(supabase);
  const cls = await classifyEmails(emails, who);

  // Existing external ids → skip duplicates (the unique index is a partial index, so we dedup in code).
  const { data: existing } = await supabase
    .from("sources")
    .select("external_id")
    .eq("source_type", "email")
    .not("external_id", "is", null);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));

  // Existing contact emails → don't re-add.
  const { data: chans } = await supabase.from("contact_channels").select("value").eq("kind", "email");
  const knownEmails = new Set((chans ?? []).map((c) => (c.value as string).toLowerCase()));

  const groups = new Map<string, number>();
  let imported = 0;
  let contactsAdded = 0;

  for (let i = 0; i < emails.length; i++) {
    const e = emails[i];
    const c = cls.get(i);
    if (!c || !c.keep || seen.has(e.id)) continue;

    const { data: src } = await supabase
      .from("sources")
      .insert({
        user_id: userId,
        source_type: "email",
        external_id: e.id,
        title: e.subject,
        from_name: e.fromName,
        from_email: e.fromEmail,
        group_label: c.group,
        permalink: gmailLink(e.id),
        occurred_at: e.dateISO,
        raw_text: e.snippet,
      })
      .select("id")
      .single();
    imported++;
    groups.set(c.group, (groups.get(c.group) ?? 0) + 1);

    // Important person / opportunity sender → add to Contacts (L0 review), deduped by email.
    if (c.addContact && e.fromEmail && !knownEmails.has(e.fromEmail) && (c.category === "person" || c.category === "opportunity")) {
      const { data: contact } = await supabase
        .from("contacts")
        .insert({
          user_id: userId,
          full_name: e.fromName,
          notes: `From email: ${e.subject}`,
          source_id: src?.id ?? null,
          source_quote: `${e.subject} — ${e.snippet}`.slice(0, 500),
          review_status: "review",
          created_by: "jarvis",
        })
        .select("id")
        .single();
      if (contact) {
        await supabase.from("contact_channels").insert({ contact_id: contact.id, kind: "email", value: e.fromEmail, is_primary: true });
        knownEmails.add(e.fromEmail);
        contactsAdded++;
      }
    }
  }

  return {
    imported,
    contactsAdded,
    groups: [...groups.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

export type CalendarIngestResult = { imported: number };

export async function ingestCalendar(supabase: SupabaseClient, userId: string): Promise<CalendarIngestResult> {
  const token = await getValidAccessToken(supabase, userId);
  const events = await listEvents(token, new Date().toISOString(), 50);
  if (!events.length) return { imported: 0 };

  const { data: existing } = await supabase
    .from("sources")
    .select("external_id")
    .eq("source_type", "calendar")
    .not("external_id", "is", null);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));

  let imported = 0;
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    const detail = [ev.endISO ? `until ${ev.endISO}` : null, ev.location].filter(Boolean).join(" · ");
    await supabase.from("sources").insert({
      user_id: userId,
      source_type: "calendar",
      external_id: ev.id,
      title: ev.summary,
      permalink: ev.htmlLink ?? null,
      occurred_at: ev.startISO,
      raw_text: detail || null,
    });
    imported++;
  }
  return { imported };
}
