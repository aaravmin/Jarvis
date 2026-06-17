import "server-only";

/** Google Drive read client (read-only). Used by the draft-from-template feature. */

const DRIVE_API = "https://www.googleapis.com/drive/v3";

/** Pull a Drive/Docs file id out of a full URL, or pass through a bare id. */
export function extractFileId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  const m = s.match(/\/d\/([a-zA-Z0-9-_]+)/); // /document/d/ID, /file/d/ID, etc.
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string };

/** Find Google Docs whose name matches a query (so "my outreach template" resolves to a file). */
export async function findDocsByName(accessToken: string, name: string): Promise<DriveFile[]> {
  const q = `name contains '${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.document' and trashed=false`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,mimeType,webViewLink)",
    pageSize: "10",
    orderBy: "modifiedTime desc",
  });
  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive search failed (${res.status}): ${await res.text()}`);
  return ((await res.json()) as { files?: DriveFile[] }).files ?? [];
}

export async function getFileMeta(accessToken: string, fileId: string): Promise<DriveFile> {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,webViewLink`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Drive metadata failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as DriveFile;
}

/**
 * Read a document's text. Google Docs are exported to text/plain; other text files are fetched with
 * alt=media. Binary/unsupported types throw a clear error rather than returning garbage.
 */
export async function readDocText(accessToken: string, fileId: string): Promise<{ name: string; text: string; webViewLink?: string }> {
  const meta = await getFileMeta(accessToken, fileId);
  let url: string;
  if (meta.mimeType === "application/vnd.google-apps.document") {
    url = `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`;
  } else if (meta.mimeType.startsWith("text/") || meta.mimeType === "application/rtf") {
    url = `${DRIVE_API}/files/${fileId}?alt=media`;
  } else {
    throw new Error(`Unsupported template type (${meta.mimeType}). Use a Google Doc or a plain-text file.`);
  }
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive export failed (${res.status}): ${await res.text()}`);
  return { name: meta.name, text: await res.text(), webViewLink: meta.webViewLink };
}
