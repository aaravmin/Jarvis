import "server-only";
import { geminiToolLoop, type GeminiContent } from "@/lib/llm/gemini";
import { webSearch } from "@/lib/search/tavily";
import { listDir, readFile, allowedRootsLabel } from "@/lib/assistant/fs-tools";
import type { AskCitation, AskFileRef, AskResponse } from "@/lib/assistant/types";
import type { AskDataContext } from "@/lib/assistant/data-tools";

/**
 * The Jarvis "brain": an agentic loop over Gemini (function-calling) with four tools —
 *  - web_search      (Tavily-backed; "search up X", current facts) → real citations
 *  - search_my_data  (the user's OWN Gmail/Calendar/meetings/tasks/contacts/opportunities) → answers
 *                     questions about their connected data; only present when a data context is passed
 *  - list_dir        (browse the user's allowed local folders)
 *  - read_file       (read a local file the user references)
 * When a data context is supplied, a compact digest of the user's world is also folded into the
 * system prompt so simple questions ("what's on my plate today?") answer without a tool round-trip.
 * Returns the answer plus provenance (web citations + files read). Read-only and server-only.
 *
 * Web search is Tavily, not the model's own browsing: the model only ever sees what webSearch()
 * returns, so every source it can cite traces to a real result URL (hard rule #3 stays intact).
 */

const WEB_SEARCH_FN = {
  name: "web_search",
  description:
    "Search the public web for anything current, changing, or outside your knowledge (news, prices, facts about specific people/companies). Returns real result pages — ground your answer in them and cite their URLs. Never invent a source.",
  parameters: {
    type: "object" as const,
    properties: { query: { type: "string", description: "The search query." } },
    required: ["query"],
  },
};

const LIST_DIR_FN = {
  name: "list_dir",
  description:
    "List the entries (files and sub-folders) of a folder on the user's computer. Use this to locate a file the user mentions (e.g. 'my fineprint folder'). Read-only.",
  parameters: {
    type: "object" as const,
    properties: { path: { type: "string", description: "Absolute path or ~/… path to a folder." } },
    required: ["path"],
  },
};

const READ_FILE_FN = {
  name: "read_file",
  description:
    "Read the text contents of a single file on the user's computer so you can answer questions about it. Read-only; you cannot modify anything.",
  parameters: {
    type: "object" as const,
    properties: { path: { type: "string", description: "Absolute path or ~/… path to a file." } },
    required: ["path"],
  },
};

const SEARCH_MY_DATA_FN = {
  name: "search_my_data",
  description:
    "Search the user's OWN connected data — their Gmail, Google Calendar events, meeting notes, tasks, contacts, and opportunities — to answer questions about their inbox, schedule, meetings, to-dos, people, or applications. Read-only. Use this whenever the question is about the user's own world (e.g. 'what's on my calendar this week', 'did anyone email me about the internship', 'what do I owe a reply to', 'who am I tracking at OpenAI'). Returns real rows with dates and links — never invent any.",
  parameters: {
    type: "object" as const,
    properties: {
      keywords: { type: "string", description: "Words to match — a sender, subject, person, org, or topic. Optional; omit to list recent items." },
      kinds: {
        type: "array",
        items: { type: "string", enum: ["email", "calendar", "meeting", "task", "contact", "opportunity"] },
        description: "Limit to these data types. Optional; omit to search all.",
      },
      when: { type: "string", enum: ["today", "upcoming", "past", "all"], description: "Time window. Optional; default all." },
    },
    required: [],
  },
};

const MAX_TURNS = 8;
const MAX_TOKENS = 8000;

function systemPrompt(todayISO: string, dataDigest?: string): string {
  const dataCap = dataDigest
    ? `\n- search_my_data: read the user's OWN connected data — their Gmail, Google Calendar, meetings, tasks, contacts, and opportunities. Use it for any question about their inbox, schedule, meetings, to-dos, people, or applications. Only state what the data shows; if something isn't there, say you don't see it rather than guessing. Refer to items by their subject/title and date, and include their link when you have one.`
    : "";
  const dataBlock = dataDigest
    ? `\n\nThe user's connected data (your working memory — use it directly for quick questions, and search_my_data for anything more specific):\n${dataDigest}`
    : "";
  return `You are Jarvis, a personal command-center assistant. You are concise, direct, and never fabricate.

Capabilities:
- web_search: use it for anything current, changing, or outside your knowledge ("search up X", news, prices, facts about specific people/companies). Always ground such answers in the sources you searched.${dataCap}
- list_dir / read_file: read the user's LOCAL files, but ONLY within these allowed folders: ${allowedRootsLabel()}. You are strictly read-only — you cannot create, edit, move, or delete anything. When the user points you at a file or folder ("my fineprint folder", "this file"), use list_dir to find it, then read_file to read it, then answer about its actual contents. Never guess a file's contents.

Rules:
- Your answers are often read ALOUD, so write in a natural spoken style: open with a short first-person line about what you just did ("I checked your inbox — …", "I searched the web and found …", "I read that file — …"), then give the answer plainly. Keep it tight; no markdown, bullet characters, or URLs in the spoken prose (sources are shown separately).
- Cite web sources you used. When you read a local file, refer to it by name/path. When you use the user's own data, name the specific email/event/task you're drawing from.
- If a folder or file isn't in the allowed list, say so plainly rather than guessing.
- Never compute or assert exact dates from reasoning; rely on the dates in the data or sources. Today is ${todayISO}.${dataBlock}`;
}

export async function ask(message: string, ctx?: AskDataContext): Promise<AskResponse> {
  const system = systemPrompt(new Date().toISOString().slice(0, 10), ctx?.dataDigest);
  const functions = ctx?.searchData
    ? [WEB_SEARCH_FN, SEARCH_MY_DATA_FN, LIST_DIR_FN, READ_FILE_FN]
    : [WEB_SEARCH_FN, LIST_DIR_FN, READ_FILE_FN];

  const citations: AskCitation[] = [];
  const seenUrls = new Set<string>();
  const files: AskFileRef[] = [];

  // Each tool runs server-side; its return value is fed back to the model as a functionResponse.
  // We harvest provenance as a side effect: web_search results become citations, read_file paths
  // become file refs. The model only ever sees what these return — it can't cite a source we didn't
  // fetch, which keeps every claim traceable (hard rule #3).
  async function execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name === "web_search") {
      const query = String(args.query ?? "").trim();
      if (!query) return { results: [] };
      const hits = await webSearch(query, { deep: true, maxResults: 6 });
      for (const h of hits) {
        if (h.url && !seenUrls.has(h.url)) {
          seenUrls.add(h.url);
          citations.push({ url: h.url, title: h.title, quote: h.content.slice(0, 280) });
        }
      }
      return { results: hits.map((h) => ({ title: h.title, url: h.url, content: h.content })) };
    }
    if (name === "read_file") {
      const out = await readFile(String(args.path ?? ""));
      if (out.ok && out.path) files.push({ path: out.path, bytes: out.bytes ?? 0 });
      return { ok: out.ok, content: out.text };
    }
    if (name === "list_dir") {
      const out = await listDir(String(args.path ?? ""));
      return { ok: out.ok, content: out.text };
    }
    if (name === "search_my_data" && ctx?.searchData) {
      const out = await ctx.searchData(
        (args as Parameters<NonNullable<AskDataContext["searchData"]>>[0]) ?? {},
      );
      return { ok: out.ok, content: out.text };
    }
    return { ok: false, content: `Unknown tool: ${name || "(unnamed)"}` };
  }

  const contents: GeminiContent[] = [{ role: "user", parts: [{ text: message }] }];

  let result: Awaited<ReturnType<typeof geminiToolLoop>>;
  try {
    result = await geminiToolLoop({
      system,
      contents,
      functions,
      execute,
      maxTurns: MAX_TURNS,
      maxTokens: MAX_TOKENS,
    });
  } catch {
    return {
      answer: "I couldn't reach the assistant just now — please try again in a moment.",
      citations,
      files: dedupeFiles(files),
    };
  }

  const answer = result.text.trim();
  if (!answer) {
    const reason =
      result.finishReason === "max_turns"
        ? "I wasn't able to finish that — it took too many steps. Try narrowing the question."
        : "(no answer)";
    return { answer: reason, citations, files: dedupeFiles(files) };
  }
  const truncated = result.finishReason === "MAX_TOKENS" ? " …(response was cut off)" : "";
  return { answer: answer + truncated, citations, files: dedupeFiles(files) };
}

function dedupeFiles(files: AskFileRef[]): AskFileRef[] {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)));
}
