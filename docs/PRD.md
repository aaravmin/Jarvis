# PRD — Otto, your personal command center

> Product definition. Derived from `/docs/ROADMAP.md` Section 2. This is the "what and why."

## One-line
A personal command center that reads your email, meetings, and calendar, turns commitments into
tracked tasks and events **with a source link for each**, and proactively surfaces what to follow
up on — controllable by voice.

## Who it's for
A job-seeker / knowledge worker who wants one place that tracks job applications, email, meetings,
calendar, goals, and the people they owe follow-ups — and *proactively* tells them what to do next,
with a clear trail back to where every item came from.

## The six jobs it does
1. **Capture commitments** from meetings ("get this in by July 29th") → a task with a due date and a
   link to the transcript moment.
2. **Catch dropped threads** — flag important emails you haven't replied to and nudge you.
3. **Schedule from language** — "let's meet Sunday" in an email → a proposed calendar event (date
   resolved correctly, not hallucinated).
4. **Track the people you owe** — a contacts list of who to follow up with: contact info
   auto-researched from the web, why they matter to your goals, what you need from them, how you know
   them, and a notes field (where the AI flags anything it isn't sure about) — with AI-drafted,
   personalized outreach.
5. **Unify the view** — one dashboard for tasks, calendar, goals, **people**, and **job applications**,
   each item showing its source.
6. **Respond to voice** — a center "orb," wake-word/voice activation, talk to it, it acts.

## The three differentiators (priority order)
1. **Unification** — email, meetings, calendar, goals, job apps in *one* view.
2. **Provenance** — every task/reminder/event links back to the exact email line or transcript moment
   that created it. The trust mechanism *and* the headline feature.
3. **Earned autonomy** — start by *proposing* ("I think this is a task — approve?"), and graduate
   high-confidence items to *automatic*. Provenance is what makes autonomy safe.

## Non-negotiable feature (day one)
Every derived item stores `source_type`, `source_id`, a `source_url`/permalink, the **exact extracted
quote**, and a `confidence` score. The UI shows a "source" chip on every card that opens the original
with the quote highlighted. **If we only ship one thing well, ship this.**

## The autonomy ladder (how trust is earned)
- **L0 – Suggest:** everything lands in a "Review" queue; you approve/reject. **(Start here.)**
- **L1 – Auto-high-confidence:** items above a confidence threshold auto-apply; you can undo.
  Low-confidence stays in Review.
- **L2 – Auto with daily digest:** it acts, and tells you what it did each morning. Intervene by
  exception.

Ship L0. Move up only when the false-positive rate is low *for you*.

## What this product is NOT
- Not a transcription tool (transcription is a commodity).
- Not a better email client (we add the judgment layer, not faster reading).
- Not a scheduler competing with Motion/Reclaim (we are the layer *above* — we decide what becomes a
  task/event in the first place).
- Not built on Notion as a database (Notion is, at most, an optional one-way mirror).
