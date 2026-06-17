# CONNECTORS — pulling information in from the outside

How Jarvis "connects to any website and contributes information." There are two honest classes, and
they cover everything you described (Gmail, Google Calendar, meeting transcribers, arbitrary pages).

## Class 1 — Real APIs (Gmail, Calendar, **Drive, Sheets**): OAuth connectors
These have official APIs, so we connect them properly: read-only scopes first, tokens stored
server-side (never in the browser), and every item they create carries a `source` (provenance).
**Status:** wiring is built after you create a Google OAuth client (below) + the DB migrations are
applied (token storage needs a table).

**Google Drive + Sheets (your two requested use cases):**
- **Drive template → draft emails.** "Use my outreach template in Drive to draft an email to X." The
  Email agent reads the named Drive doc (read-only), fills it, and drafts the email (draft only first —
  sending needs the `gmail.send` write scope, added when you approve that step).
- **Sheets database → create contacts.** "Make contacts from my alumni sheet." The Contact agent reads
  the spreadsheet, maps columns → contact fields, and lands each row in **Review** as a suggested
  contact with provenance (`source = the sheet + the row`), so nothing is created without your approval
  (L0). This reuses the same Review/provenance model as the auto-populate people agent.

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
2. **Enable APIs**: APIs & Services → Library → enable **Gmail API**, **Google Calendar API**,
   **Google Drive API**, and **Google Sheets API**.
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
- `https://www.googleapis.com/auth/drive.readonly` — read templates/docs (for draft-from-template)
- `https://www.googleapis.com/auth/spreadsheets.readonly` — read sheets (for contacts-from-sheet)

Write scopes (`gmail.send` for sending drafts, `calendar.events` for creating events) are added only
when you approve that step (Phase 3/6) — read-only first.

---

## What gets built once the client exists + migrations are applied
- `0005_connected_accounts.sql` — a `connected_accounts` table (provider, access/refresh tokens,
  expiry, granted scopes, user-scoped RLS) to hold Google tokens server-side. (Encryption-at-rest is a
  hardening follow-up; RLS + server-only access is the baseline.)
- `GET /api/connect/google` (start OAuth) + `/api/connect/google/callback` (exchange code, store tokens).
- A **Connections** surface to connect/disconnect accounts and show status + granted scopes.
- **Gmail + Calendar** readers → ingest into `sources` → extraction engine derives `items` (tasks /
  events / follow-ups) into Review, each with its source link.
- **Drive** reader → the Email agent drafts from a named template doc (draft-from-template).
- **Sheets** reader → the Contact agent maps rows → contacts into Review (contacts-from-sheet), reusing
  the auto-populate provenance/Review model.

> Order, respecting "migrations before new implementations": apply `0001–0004` (needs the real
> Supabase access token — now fixed), then the Google connector bundle: `0005_connected_accounts`
> + OAuth flow + the Gmail/Calendar/Drive/Sheets readers.
