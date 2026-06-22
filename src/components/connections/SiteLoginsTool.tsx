"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2, Plus } from "lucide-react";

/**
 * Manage the per-user encrypted login vault on the Connections page. You save a site login (LinkedIn
 * and others); Jarvis can then sign into that site for you when it scrapes. The password is encrypted
 * on the server and is never sent back to the browser: this list shows the username and a "saved" flag
 * only. When CREDENTIALS_SECRET is not configured, the form is disabled with a clear explanation.
 */

type Cred = { site: string; label: string | null; username: string | null; hasSecret: boolean; updatedAt: string };

const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted disabled:opacity-50";

export function SiteLoginsTool() {
  const [enabled, setEnabled] = useState(true);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [site, setSite] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/credentials");
      const d = await r.json();
      if (r.ok) {
        setEnabled(Boolean(d.enabled));
        setCreds(d.credentials ?? []);
      }
    } catch {
      /* leave defaults */
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site, username, password }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setMsg({ tone: "bad", text: d?.error ?? "Could not save." });
      } else {
        setMsg({ tone: "ok", text: `Saved login for ${d.site}.` });
        setSite("");
        setUsername("");
        setPassword("");
        void load();
      }
    } catch {
      setMsg({ tone: "bad", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: string) {
    await fetch(`/api/credentials?site=${encodeURIComponent(s)}`, { method: "DELETE" });
    void load();
  }

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Saved site logins</h2>
      </div>
      <p className="mb-3 text-xs text-muted">
        Save a login and Jarvis can sign into that site for you when it scrapes (LinkedIn, and others). Passwords are
        encrypted on the server and never shown again.
      </p>

      {!enabled && (
        <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Saved logins are off on this server. Set CREDENTIALS_SECRET (run: openssl rand -base64 32) to turn on the
          encrypted vault.
        </p>
      )}

      {creds.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {creds.map((c) => (
            <li key={c.site} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">{c.site}</span>
                {c.username ? <span className="text-muted"> · {c.username}</span> : null}
                <span className="text-success"> · saved</span>
              </span>
              <button type="button" onClick={() => void remove(c.site)} className="shrink-0 text-muted hover:text-danger" aria-label={`Remove ${c.site}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site, e.g. linkedin.com" disabled={!enabled || busy} className={input} />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username or email" disabled={!enabled || busy} className={input} autoComplete="off" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" disabled={!enabled || busy} className={input} autoComplete="new-password" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void add()}
          disabled={!enabled || busy || !site || !password}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save login
        </button>
        {msg && <span className={`text-xs ${msg.tone === "ok" ? "text-success" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
