import "server-only";
import crypto from "crypto";

/**
 * AES-256-GCM encryption for secrets we must store (site login passwords for auto-login). The key is
 * CREDENTIALS_SECRET, 32 random bytes base64-encoded, kept server-side only (never shipped to the
 * browser). GCM gives us authenticated encryption: tampering with the ciphertext fails decryption.
 *
 * Generate a key once with:  openssl rand -base64 32
 * and put it in .env.local as CREDENTIALS_SECRET. With no key set, credentialsEnabled() is false and
 * the whole vault feature degrades gracefully (the UI explains how to turn it on).
 */

function key(): Buffer {
  const raw = process.env.CREDENTIALS_SECRET;
  if (!raw) throw new Error("CREDENTIALS_SECRET is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("CREDENTIALS_SECRET must be 32 random bytes, base64-encoded");
  return buf;
}

/** True when a valid encryption key is configured. Callers gate the vault UI/feature on this. */
export function credentialsEnabled(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt plaintext to "base64(iv).base64(tag).base64(ciphertext)". */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

/** Decrypt a blob produced by encryptSecret. Throws if the key is wrong or the data was tampered. */
export function decryptSecret(blob: string): string {
  const [ivB, tagB, ctB] = (blob || "").split(".");
  if (!ivB || !tagB || !ctB) throw new Error("malformed secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}
