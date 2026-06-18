import "server-only";

/** Gmail read client (read-only). Pulls recent inbox messages for ingestion. */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessage = {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  dateISO: string;
};

function header(headers: { name?: string; value?: string }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Parse a From header ("Jane Doe <jane@x.com>") into name + email. */
function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?/);
  const email = (m?.[2] ?? "").trim().toLowerCase();
  let name = (m?.[1] ?? "").trim();
  if (!name) name = email.split("@")[0] ?? from;
  return { name, email };
}

/** Recent inbox message ids (Primary-ish: excludes promotions/social/updates spam buckets). */
export async function listMessageIds(token: string, max = 40): Promise<{ id: string; threadId: string }[]> {
  const q = "in:inbox -category:promotions -category:social";
  const res = await fetch(`${API}/messages?maxResults=${max}&q=${encodeURIComponent(q)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { messages?: { id: string; threadId: string }[] };
  return data.messages ?? [];
}

export async function getMessage(token: string, id: string): Promise<GmailMessage> {
  const res = await fetch(
    `${API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Gmail get failed (${res.status}): ${await res.text()}`);
  const m = (await res.json()) as {
    id: string;
    threadId: string;
    snippet?: string;
    internalDate?: string;
    payload?: { headers?: { name?: string; value?: string }[] };
  };
  const headers = m.payload?.headers ?? [];
  const { name, email } = parseFrom(header(headers, "From"));
  const dateISO = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
  return {
    id: m.id,
    threadId: m.threadId,
    fromName: name,
    fromEmail: email,
    subject: header(headers, "Subject") || "(no subject)",
    snippet: m.snippet ?? "",
    dateISO,
  };
}

/** A web link to open a message in Gmail. */
export function gmailLink(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${id}`;
}
