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

/** Strip CR/LF so a header value can't inject extra headers (header-injection guard). */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoded-word for header values that contain non-ASCII (keeps subjects intact). */
function encodeHeader(value: string): string {
  const clean = sanitizeHeaderValue(value);
  let ascii = true;
  for (let i = 0; i < clean.length; i++) {
    if (clean.charCodeAt(i) > 0x7f) {
      ascii = false;
      break;
    }
  }
  if (ascii) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** Build a minimal RFC 2822 message and base64url-encode it for the Gmail drafts API. */
function buildRawMessage(opts: { to?: string; subject: string; body: string }): string {
  const to = opts.to ? sanitizeHeaderValue(opts.to) : "";
  const headers = [
    to ? `To: ${to}` : "",
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);
  // Body keeps its newlines but is normalized to CRLF per RFC 2822.
  const body = opts.body.replace(/\r?\n/g, "\r\n");
  const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(message, "utf8").toString("base64url");
}

export type GmailDraft = { id: string; messageId?: string; url: string };

/**
 * Create a Gmail DRAFT (never sends) from a subject/body. Requires the gmail.compose scope. The draft
 * lands in the user's Drafts folder for them to review and send — keeping us at autonomy L0 for email.
 */
export async function createDraft(
  token: string,
  opts: { to?: string; subject: string; body: string },
): Promise<GmailDraft> {
  const raw = buildRawMessage(opts);
  const res = await fetch(`${API}/drafts`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) throw new Error(`Gmail draft create failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { id: string; message?: { id?: string } };
  return {
    id: data.id,
    messageId: data.message?.id,
    url: "https://mail.google.com/mail/u/0/#drafts",
  };
}
