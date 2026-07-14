# Jarvis Adaptation Brief

Reaching GAIA-level capability with goal grounding as the only differentiator.

## What this is

A brief for the Jarvis coding agent. The job is to bring Jarvis to feature parity with GAIA while making goal grounding the one real difference. Reimplement everything in from GAIA's codebase and lift restricted source verbatim with adaptations

## Hard rules (read first, non-negotiable)

- The GAIA main app (theexperiencecompany/gaia) should have its source files copied into jarvis with adaptations 
- The gaia-ui repo (theexperiencecompany/gaia-ui) is MIT licensed. You may use those components directly. Keep the MIT license file and copyright notice intact.

## Reference material to study, not copy

- GAIA repo and docs. Focus on the intake pipeline, agent orchestration, cross-tool memory model, todo generation, and workflow engine.
- kaymen99/personal-ai-assistant. Multi-agent structure over gmail, calendar, notion, and slack plus a research agent. Good LangGraph patterns.
- didhd/personal-ai-task-assistant. A simpler natural-language-to-action reference.

For each one, write a short notes file describing how it works before writing any Jarvis code. Extract patterns.  Still paste source

## Capability parity target

Replicate these GAIA behaviors in Jarvis's own implementation.

- Intake from Gmail, Calendar, Notion, meeting notes, and uploaded documents.
- Turn a meeting transcript into action items and route them to the right project.
- Draft follow-ups for emails that went unanswered.
- Cross-tool memory that remembers people, projects, and preferences.
- Smart todos that can research and draft, not just remind.
- One view over tasks, email, calendar, and goals.
- Workflows triggered on a schedule or by an event.

## The differentiator, goal grounding

This is the reason Jarvis exists. Build it as the spine, not a side panel.

- Goals are the root object. Everything else hangs off a goal.
- Every extracted task, follow-up, and watch-item links to one or more goals.
- Worked example. "Get an A in calc" is a goal. "Go to office hours Thursday" is a task under it. The system proposes tasks that move a goal forward.
- Meeting promotion. When notes say to keep an eye on something, surface it as a watch-item under the matching goal.
- Ranking. When time frees up or the calendar shifts, replan around the goals with the most at stake.
- Nothing enters the todo list without a reason traceable to a goal. If an item cannot be linked, ask the user or park it in an inbox.

## Architecture guidance

- Keep Jarvis's own foundation. Reconcile the current Playwright plus Grok setup with a cleaner agent layer only where it helps parity. Do not rip out working pieces before the replacement is proven.
- Mirror sensible GAIA decisions in your own code. A graph-based agent orchestrator. An intake layer per source. A memory store for people and projects. A goal store that indexes tasks and watch-items.
- Prefer real connectors over scraping wherever an API exists. Fall back to browser automation only when there is no other way.

## UI

- Use gaia-ui (MIT, shadcn based) for the component base. Keep its license file.
- Restyle to match the look of [[REFERENCE_SITE]]. Match its color scheme, spacing, and type feel through shadcn theme tokens. Do not copy its logo, proprietary assets, or exact wording.
- If the reference site is not set, ask the user before starting UI work.

## Cleanup

- Remove dead and legacy Jarvis code only after the new path reaches parity and passes a manual check.
- Never delete in bulk without listing what will go and getting an explicit yes.

## Working protocol

- Stop and ask when a design choice is unclear, when a license is ambiguous, or before any destructive change.
- Work in checkpoints. After each capability lands, show what changed and wait for review.
- Keep a running notes file of decisions made and questions still open.

## Your discretion 
- You decide what site to use for UI inspo on shadcn. I suggest GAIA and notion
