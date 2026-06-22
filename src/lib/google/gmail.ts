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
  /** Decoded plain-text body (best-effort; falls back to snippet). The corpus the extractor quotes. */
  body: string;
  dateISO: string;
};

function header(headers: { name?: string; value?: string }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

const MAX_BODY = 16_000; // enough for a real email; guards against a giant newsletter blowing up tokens

/** Gmail's MIME tree node, recursive, optionally multipart, each part optionally carrying body data. */
type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

/** Strip HTML to readable text when a message has no text/plain alternative. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function decodePart(data: string | undefined): string {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Pull the best readable body out of a Gmail payload tree: prefer text/plain, fall back to a
 * stripped text/html. Walks nested multiparts (multipart/alternative, multipart/mixed with
 * attachments) and ignores attachment parts (which carry an attachmentId, not inline data).
 */
function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return "";
  let plain = "";
  let html = "";
  const walk = (part: GmailPart) => {
    const mime = (part.mimeType ?? "").toLowerCase();
    if (mime === "text/plain") plain += decodePart(part.body?.data);
    else if (mime === "text/html") html += decodePart(part.body?.data);
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  const text = plain.trim() || htmlToText(html).trim();
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_BODY);
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
  // format=full gives the full MIME tree so we can read the body (the extractor's corpus), not just
  // the ~160-char snippet. We still only ever read; no write scope is implied.
  const res = await fetch(`${API}/messages/${id}?format=full`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail get failed (${res.status}): ${await res.text()}`);
  const m = (await res.json()) as {
    id: string;
    threadId: string;
    snippet?: string;
    internalDate?: string;
    payload?: GmailPart & { headers?: { name?: string; value?: string }[] };
  };
  const headers = m.payload?.headers ?? [];
  const { name, email } = parseFrom(header(headers, "From"));
  const dateISO = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
  const snippet = m.snippet ?? "";
  return {
    id: m.id,
    threadId: m.threadId,
    fromName: name,
    fromEmail: email,
    subject: header(headers, "Subject") || "(no subject)",
    snippet,
    body: extractBody(m.payload) || snippet,
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
 * lands in the user's Drafts folder for them to review and send, keeping us at autonomy L0 for email.
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
