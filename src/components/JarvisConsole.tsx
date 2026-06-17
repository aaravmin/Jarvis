"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Globe, FileText, ExternalLink, Square } from "lucide-react";
import { JarvisOrb, type OrbState } from "@/components/JarvisOrb";
import { LiveClock } from "@/components/LiveClock";
import type { AskResponse } from "@/lib/assistant/types";

// Minimal typings for the browser SpeechRecognition API (no extra dependency).
type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const EXAMPLES = [
  "Search up the latest on the YC Spring 2026 batch",
  "Look in my fineprint folder and summarize the newest file",
  "What are the main risks in the contract in my fineprint folder?",
];

export function JarvisConsole({ hero = false }: { hero?: boolean }) {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<OrbState>("idle");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  // Mirror of phase so submit() can guard re-entry without being recreated each render.
  const phaseRef = useRef<OrbState>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const submit = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || phaseIsBusy(phaseRef.current)) return;
    setPhase("thinking");
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Jarvis couldn't answer that.");
      } else {
        setAnswer(data as AskResponse);
      }
    } catch {
      setError("Network error reaching the assistant.");
    } finally {
      setPhase("idle");
    }
  }, []);

  const startListening = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    finalTranscriptRef.current = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finalTranscriptRef.current += text;
        else interim += text;
      }
      setInput((finalTranscriptRef.current + interim).trimStart());
    };
    rec.onend = () => {
      setPhase("idle");
      recognitionRef.current = null;
      const said = finalTranscriptRef.current.trim();
      if (said) void submit(said);
    };
    rec.onerror = () => {
      setPhase("idle");
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    setPhase("listening");
    setError(null);
    rec.start();
  }, [submit]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const listening = phase === "listening";
  const thinking = phase === "thinking";

  const statusText = thinking
    ? "Thinking…"
    : listening
      ? "Listening… speak, then pause"
      : "Ask anything — I can search the web and read your files";

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center">
      {hero && (
        <div className="mb-6">
          <LiveClock />
        </div>
      )}

      <button
        type="button"
        onClick={() => (listening ? stopListening() : voiceSupported ? startListening() : undefined)}
        disabled={thinking}
        aria-label={listening ? "Stop listening" : "Talk to Jarvis"}
        className="mt-2 mb-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
      >
        <JarvisOrb state={phase} />
      </button>

      {hero ? (
        <div className="mb-5 text-center">
          <h1 className="text-3xl font-semibold tracking-[0.45em] text-foreground sm:text-4xl">
            <span className="pl-[0.45em]">JARVIS</span>
          </h1>
          <p className="mt-1.5 h-5 text-sm text-muted">{statusText}</p>
        </div>
      ) : (
        <p className="mb-5 h-5 text-sm text-muted">{statusText}</p>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2"
      >
        {voiceSupported && (
          <button
            type="button"
            onClick={() => (listening ? stopListening() : startListening())}
            disabled={thinking}
            aria-label={listening ? "Stop" : "Talk"}
            className={`rounded-lg p-1.5 transition-colors ${listening ? "text-danger" : "text-muted hover:text-accent"}`}
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={thinking}
          placeholder="Search up something, or ask about a file…"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={thinking || input.trim().length === 0}
          className="rounded-lg bg-accent p-1.5 text-[#04181f] transition-colors hover:bg-accent-strong disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {!answer && !error && !thinking && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-5 w-full rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {answer && (
        <div className="mt-5 w-full space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {answer.answer}
            </p>
          </div>

          {answer.citations.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                <Globe className="h-3.5 w-3.5 text-accent" /> Web sources
              </p>
              <ul className="space-y-1.5">
                {answer.citations.map((c, i) => (
                  <li key={`${c.url}-${i}`}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={c.quote}
                      className="inline-flex max-w-full items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{c.title || c.url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {answer.files.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                <FileText className="h-3.5 w-3.5 text-accent" /> Files read
              </p>
              <ul className="space-y-1">
                {answer.files.map((f) => (
                  <li key={f.path} className="truncate font-mono text-xs text-muted-strong" title={f.path}>
                    {f.path} · {(f.bytes / 1024).toFixed(1)} KB
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function phaseIsBusy(p: OrbState): boolean {
  return p === "thinking" || p === "listening";
}
