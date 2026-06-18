import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { listDir, readFile, allowedRootsLabel } from "@/lib/assistant/fs-tools";
import type { AskCitation, AskFileRef, AskResponse } from "@/lib/assistant/types";
import type { AskDataContext } from "@/lib/assistant/data-tools";

/**
 * The Jarvis "brain": an agentic loop over Claude with four tools —
 *  - web_search      (server-side; "search up X", current facts) → real citations
 *  - search_my_data  (the user's OWN Gmail/Calendar/meetings/tasks/contacts/opportunities) → answers
 *                     questions about their connected data; only present when a data context is passed
 *  - list_dir        (client-side; browse the user's allowed local folders)
 *  - read_file       (client-side; read a local file the user references)
 * When a data context is supplied, a compact digest of the user's world is also folded into the
 * system prompt so simple questions ("what's on my plate today?") answer without a tool round-trip.
 * Returns the answer plus provenance (web citations + files read). Read-only and server-only.
 */

const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 6 } as const;

const LIST_DIR_TOOL = {
  name: "list_dir",
  description:
    "List the entries (files and sub-folders) of a folder on the user's computer. Use this to locate a file the user mentions (e.g. 'my fineprint folder'). Read-only.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: { path: { type: "string", description: "Absolute path or ~/… path to a folder." } },
    required: ["path"],
  },
};

const READ_FILE_TOOL = {
  name: "read_file",
  description:
    "Read the text contents of a single file on the user's computer so you can answer questions about it. Read-only; you cannot modify anything.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: { path: { type: "string", description: "Absolute path or ~/… path to a file." } },
    required: ["path"],
  },
};

const SEARCH_MY_DATA_TOOL = {
  name: "search_my_data",
  description:
    "Search the user's OWN connected data — their Gmail, Google Calendar events, meeting notes, tasks, contacts, and opportunities — to answer questions about their inbox, schedule, meetings, to-dos, people, or applications. Read-only. Use this whenever the question is about the user's own world (e.g. 'what's on my calendar this week', 'did anyone email me about the internship', 'what do I owe a reply to', 'who am I tracking at OpenAI'). Returns real rows with dates and links — never invent any.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
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

const DEFAULT_MODEL = "claude-opus-4-8";
const MAX_TURNS = 8;
const MAX_TOKENS = 8000;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. The assistant runs server-side and needs it in .env.local.");
  }
  return new Anthropic({ apiKey });
}

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
- Cite web sources you used. When you read a local file, refer to it by name/path. When you use the user's own data, name the specific email/event/task you're drawing from.
- If a folder or file isn't in the allowed list, say so plainly rather than guessing.
- Never compute or assert exact dates from reasoning; rely on the dates in the data or sources. Today is ${todayISO}.${dataBlock}`;
}

type Block = {
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  citations?: Array<{ type?: string; url?: string; title?: string; cited_text?: string }>;
};

function harvest(content: Block[], citations: AskCitation[], seen: Set<string>) {
  for (const b of content) {
    if (b.type === "text" && Array.isArray(b.citations)) {
      for (const c of b.citations) {
        if (c.type === "web_search_result_location" && c.url && !seen.has(c.url)) {
          seen.add(c.url);
          citations.push({ url: c.url, title: c.title, quote: c.cited_text });
        }
      }
    }
  }
}

export async function ask(message: string, ctx?: AskDataContext): Promise<AskResponse> {
  const client = getClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const system = systemPrompt(new Date().toISOString().slice(0, 10), ctx?.dataDigest);
  const tools = ctx?.searchData
    ? [WEB_SEARCH_TOOL, SEARCH_MY_DATA_TOOL, LIST_DIR_TOOL, READ_FILE_TOOL]
    : [WEB_SEARCH_TOOL, LIST_DIR_TOOL, READ_FILE_TOOL];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];
  const citations: AskCitation[] = [];
  const seenUrls = new Set<string>();
  const files: AskFileRef[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const params = {
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools,
      messages,
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;

    const resp = await client.messages.create(params);
    const content = resp.content as unknown as Block[];
    harvest(content, citations, seenUrls);

    // Branch on the authoritative signal (stop_reason), not on content shape.

    // Server tool (web_search) paused mid-loop: resume by echoing the assistant turn back.
    if (resp.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: resp.content });
      continue;
    }

    // The model declined. Surface it instead of returning an empty "(no answer)".
    if (resp.stop_reason === "refusal") {
      return { answer: "I can't help with that request.", citations, files: dedupeFiles(files) };
    }

    // The model wants client tools. Every tool_use block MUST get a matching tool_result, or the
    // next call 400s — so answer ALL of them (unknown names get an is_error result so the model can
    // recover). Server tool blocks (server_tool_use/web_search_tool_result) are a different type and
    // are excluded here; they ride along in the echoed assistant content.
    if (resp.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of content.filter((b) => b.type === "tool_use")) {
        const p = (tu.input as { path?: string } | undefined)?.path ?? "";
        let out: { ok: boolean; text: string; path?: string; bytes?: number };
        if (tu.name === "read_file") out = await readFile(p);
        else if (tu.name === "list_dir") out = await listDir(p);
        else if (tu.name === "search_my_data" && ctx?.searchData)
          out = await ctx.searchData((tu.input as Parameters<NonNullable<AskDataContext["searchData"]>>[0]) ?? {});
        else out = { ok: false, text: `Unknown tool: ${tu.name ?? "(unnamed)"}` };
        if (tu.name === "read_file" && out.ok && out.path) {
          files.push({ path: out.path, bytes: out.bytes ?? 0 });
        }
        results.push({
          type: "tool_result",
          tool_use_id: tu.id as string,
          content: out.text,
          is_error: !out.ok,
        });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn / max_tokens / stop_sequence / unknown → final answer.
    const answer = content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim();
    const truncated = resp.stop_reason === "max_tokens" ? " …(response was cut off)" : "";
    return {
      answer: answer ? answer + truncated : "(no answer)",
      citations,
      files: dedupeFiles(files),
    };
  }

  return {
    answer: "I wasn't able to finish that — it took too many steps. Try narrowing the question.",
    citations,
    files: dedupeFiles(files),
  };
}

function dedupeFiles(files: AskFileRef[]): AskFileRef[] {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)));
}
