# CONNECTORS — pulling information in from the outside

How Jarvis "connects to any website and contributes information." There are two honest classes, and
they cover everything you described (Gmail, Google Calendar, meeting transcribers, arbitrary pages).

## Class 1 — Real APIs (Gmail, Google Calendar): OAuth connectors
These have official APIs, so we connect them properly: read-only scopes first, tokens stored
server-side (never in the browser), and every item they create carries a `source` (provenance).
**Status:** wiring is built after you create a Google OAuth client (below) + the DB migrations are
applied (token storage needs a table).

## Class 2 — Everything else (transcribers, any page): paste-or-URL ingest
There is no universal "log into any website and pull data" API. For meeting transcribers and
arbitrary pages we use a generic ingest: you paste a transcript / text, or give a **public URL**, and
Jarvis pulls it into a `source` and derives sourced tasks/events/people into the Review queue
(reusing the extraction engine + provenance model). Sites behind a login need either their official
API/OAuth (Class 1) or browser automation (the gated Phase-9 path) — we never store your passwords.

**Already live (no setup needed):** the **Ask Jarvis** orb (`/jarvis`) can already **search the web**
and **read your local files** (read-only) to answer questions — that's the fastest "pull info from
anywhere" path for one-off questions.

---

## Set up the Google OAuth client (do this once; ~10 min)

1. **Google Cloud Console** → https://console.cloud.google.com → create or pick a project (e.g. "Jarvis").
2. **Enable APIs**: APIs & Services → Library → enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen**: External; App name "Jarvis"; add your email as a **Test user** (keeps it
   in testing mode — no Google verification needed for personal use). Scopes can be left default here;
   we request them at connect time.
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URI**: `http://localhost:3000/api/connect/google/callback`
     (add your deployed URL's `/api/connect/google/callback` later if you deploy)
5. Copy the **Client ID** and **Client secret** into `.env.local` (server-side; gitignored):
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_OAUTH_REDIRECT=http://localhost:3000/api/connect/google/callback
   ```

**Scopes we'll request (narrowest first, per the hard rules):**
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

Write scopes (sending email, creating events) are added only when a feature needs them (Phase 3/6).

---

## What gets built once the client exists + migrations are applied
- `0004_integrations.sql` — a `connected_accounts` table (provider, encrypted refresh token, scopes,
  user-scoped RLS) to hold Google tokens server-side.
- `GET /api/connect/google` (start OAuth) + `/api/connect/google/callback` (exchange code, store tokens).
- A **Connections** surface to connect/disconnect accounts and show status.
- Gmail + Calendar readers that ingest into `sources`, then the extraction engine derives `items`
  (tasks / events / follow-ups) into the Review queue — each with its source link.
- The generic **paste/URL ingest** for transcribers and arbitrary pages.

> Order, respecting "migrations before new implementations": apply `0001–0003` (needs the real
> Supabase access token), then the paste/URL ingest (no extra infra), then the Google connectors
> (needs the OAuth client above).
