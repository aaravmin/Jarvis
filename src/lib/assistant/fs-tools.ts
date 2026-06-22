import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Read-ONLY local filesystem access for the Jarvis assistant, usable only because the Next server
 * runs on the user's own machine in local dev. Hardened:
 *  - Allowlisted roots only (JARVIS_FILE_ROOTS, default ~/Desktop). realpath resolves symlinks so
 *    a link can't escape the allowlist.
 *  - Deny secrets (.env*, .ssh, .aws, keys/pems, git internals) even inside an allowed root.
 *  - No write/delete/execute. Size-capped. Binary files are described, not dumped.
 */

const MAX_BYTES = 256 * 1024;

function expandTilde(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function roots(): string[] {
  const raw = process.env.JARVIS_FILE_ROOTS || path.join(os.homedir(), "Desktop");
  return raw
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(expandTilde(p)));
}

const DENY = [
  /(^|\/)\.env(\.|$|\/)/i, // .env, .env.local, ...
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.aws(\/|$)/i,
  /(^|\/)\.gnupg(\/|$)/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /\.(pem|key|p12|pfx|keystore)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa)(\.|$)/i,
  /(^|\/)(credentials|secrets?)(\.|$|\/)/i,
];

export type FsResult = { ok: boolean; text: string; path?: string; bytes?: number };

/** Resolve a user-supplied path and confirm it's an allowlisted, non-denied location. */
async function resolveSafe(input: string): Promise<{ ok: true; real: string } | { ok: false; reason: string }> {
  if (!input || typeof input !== "string") return { ok: false, reason: "no path given" };
  const candidate = path.resolve(expandTilde(input.trim()));
  let real: string;
  try {
    real = await fs.realpath(candidate);
  } catch {
    // Path may not exist yet (e.g. listing a dir that's fine); fall back to the resolved candidate
    // but still subject it to the allowlist check below.
    real = candidate;
  }
  const allowed = roots().some((r) => real === r || real.startsWith(r + path.sep));
  if (!allowed) {
    return { ok: false, reason: `outside the allowed folders (${roots().join(", ")})` };
  }
  if (DENY.some((rx) => rx.test(real))) {
    return { ok: false, reason: "this looks like a secret/credential or system path, access denied" };
  }
  return { ok: true, real };
}

/** List a directory's entries (one level), marking subfolders. */
export async function listDir(input: string): Promise<FsResult> {
  const safe = await resolveSafe(input);
  if (!safe.ok) return { ok: false, text: `Can't list "${input}": ${safe.reason}.` };
  try {
    const entries = await fs.readdir(safe.real, { withFileTypes: true });
    const visible = entries
      .filter((e) => !DENY.some((rx) => rx.test(path.join(safe.real, e.name))))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
    return {
      ok: true,
      path: safe.real,
      text:
        visible.length === 0
          ? `(${safe.real} is empty or contains only hidden/denied entries)`
          : `${safe.real}:\n${visible.join("\n")}`,
    };
  } catch (e) {
    return { ok: false, text: `Can't list "${input}": ${e instanceof Error ? e.message : "error"}.` };
  }
}

/** Read a text file (read-only, size-capped). Binary files are described, not returned. */
export async function readFile(input: string): Promise<FsResult> {
  const safe = await resolveSafe(input);
  if (!safe.ok) return { ok: false, text: `Can't read "${input}": ${safe.reason}.` };
  try {
    const stat = await fs.stat(safe.real);
    if (stat.isDirectory()) {
      return { ok: false, text: `"${safe.real}" is a folder, not a file. Use list_dir to see what's inside.` };
    }
    if (stat.size > MAX_BYTES) {
      return {
        ok: false,
        text: `"${safe.real}" is ${(stat.size / 1024).toFixed(0)} KB, too large to read in full (cap ${MAX_BYTES / 1024} KB).`,
      };
    }
    const buf = await fs.readFile(safe.real);
    if (buf.includes(0)) {
      return { ok: false, text: `"${safe.real}" looks like a binary file (${stat.size} bytes); not reading it as text.` };
    }
    return { ok: true, path: safe.real, bytes: stat.size, text: buf.toString("utf8") };
  } catch (e) {
    return { ok: false, text: `Can't read "${input}": ${e instanceof Error ? e.message : "error"}.` };
  }
}

/** Human-readable list of the folders the assistant is allowed to read (for the system prompt/UI). */
export function allowedRootsLabel(): string {
  return roots().join(", ");
}
