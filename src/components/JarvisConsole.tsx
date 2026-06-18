"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Globe, FileText, ExternalLink, Square, Volume2, VolumeX, Headphones } from "lucide-react";
import { JarvisOrb, type OrbState } from "@/components/JarvisOrb";
import { JarvisSphere } from "@/components/JarvisSphere";
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
  "What's on my plate today?",
  "Did anyone email me about the internship?",
  "What's on my calendar this week?",
  "Search up the latest on the YC Spring 2026 batch",
  "Summarize the newest file in my fineprint folder",
];

export function JarvisConsole({ hero = false }: { hero?: boolean }) {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<OrbState>("idle");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  // Spoken replies (ElevenLabs via /api/voice). On by default; the preference is remembered.
  const [speechOn, setSpeechOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  // Hands-free conversation: you speak → pause → Jarvis answers ALOUD → the mic re-opens for your
  // next turn, looping until you stop talking or toggle it off. Ephemeral (needs a tap to start, so
  // it's never restored "on" but idle on reload). Voice output is forced on while it's active.
  const [convoMode, setConvoMode] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const finalTranscriptRef = useRef("");
  // Mirror of phase so submit() can guard re-entry without being recreated each render.
  const phaseRef = useRef<OrbState>("idle");
  // Mirrors so callbacks/audio handlers read live values without being recreated (and without
  // re-running the speak effect when only a preference toggles).
  const convoModeRef = useRef(false);
  const speechOnRef = useRef(true);
  // Late-bound ref to startListening so speak()'s "next turn" can re-open the mic without a cycle.
  const startListeningRef = useRef<() => void>(() => {});
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    speechOnRef.current = speechOn;
  }, [speechOn]);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Restore the saved spoken-reply preference.
  useEffect(() => {
    try {
      if (localStorage.getItem("jarvis_voice") === "off") setSpeechOn(false);
    } catch {
      /* private mode / no storage — keep the default */
    }
  }, []);

  // Halt any in-flight playback and release the audio blob URL.
  const stopSpeaking = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      // Detach handlers BEFORE clearing src — otherwise setting src="" can fire onerror, which would
      // re-trigger afterSpeaking() and spuriously re-open the mic.
      a.onended = null;
      a.onerror = null;
      a.pause();
      a.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeaking(false);
  }, []);

  // When Jarvis finishes (or fails to) speak: in conversation mode, re-open the mic for the next turn;
  // otherwise just settle back to idle. This is the loop's hinge.
  const afterSpeaking = useCallback(() => {
    stopSpeaking();
    if (convoModeRef.current) startListeningRef.current();
    else setPhase("idle");
  }, [stopSpeaking]);

  // Speak `text` with Jarvis's voice. Server holds the ElevenLabs key; a 503 (no key) or any other
  // failure just leaves the answer silent — speaking is a progressive enhancement, never required.
  const speak = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return afterSpeaking();
      stopSpeaking();
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: clean }),
        });
        if (!res.ok) return afterSpeaking(); // not configured / outage — stay silent, keep the loop alive
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = afterSpeaking;
        audio.onerror = afterSpeaking;
        setSpeaking(true);
        setPhase("speaking");
        // Autoplay may be blocked if the browser doesn't tie this to the recent gesture — fail quietly
        // but still advance the conversation loop.
        await audio.play().catch(afterSpeaking);
      } catch {
        afterSpeaking();
      }
    },
    [stopSpeaking, afterSpeaking],
  );

  // Speak each NEW answer (when voice is on, or always in conversation mode). Keyed on `answer` alone
  // so toggling a preference never replays an old reply; live prefs are read via refs.
  useEffect(() => {
    if (answer?.answer && (speechOnRef.current || convoModeRef.current)) void speak(answer.answer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  // Stop audio if the component unmounts mid-sentence.
  useEffect(() => stopSpeaking, [stopSpeaking]);

  const toggleSpeech = useCallback(() => {
    setSpeechOn((on) => {
      const next = !on;
      try {
        localStorage.setItem("jarvis_voice", next ? "on" : "off");
      } catch {
        /* ignore */
      }
      if (!next) stopSpeaking();
      return next;
    });
  }, [stopSpeaking]);

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
        setPhase("idle");
        // Keep a hands-free conversation going even after a stumble.
        if (convoModeRef.current) startListeningRef.current();
      } else {
        // Success: the speak effect takes over (and, in convo mode, re-opens the mic when it ends).
        // If voice is off and we're not conversing, settle to idle now.
        setAnswer(data as AskResponse);
        if (!speechOnRef.current && !convoModeRef.current) setPhase("idle");
      }
    } catch {
      setError("Network error reaching the assistant.");
      setPhase("idle");
      if (convoModeRef.current) startListeningRef.current();
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
      // e.results is CUMULATIVE — it contains every result for the session, and finalized ones keep
      // their isFinal flag on later events. So rebuild the transcript from scratch each event rather
      // than appending, or already-final segments get re-added and duplicated.
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += text;
        else interim += text;
      }
      finalTranscriptRef.current = finalText;
      setInput((finalText + interim).trimStart());
    };
    rec.onend = () => {
      recognitionRef.current = null;
      const said = finalTranscriptRef.current.trim();
      if (said) {
        setInput("");
        void submit(said);
      } else {
        // Heard nothing — settle to idle. In conversation mode this is the natural way to end the
        // back-and-forth (you simply stop talking); tap the orb to start a new turn.
        setPhase("idle");
      }
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

  // Keep the late-bound ref pointing at the latest startListening so afterSpeaking()/submit() can
  // re-open the mic for the next conversational turn without a render-time dependency cycle.
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Toggle hands-free conversation. Turning it ON (a real user gesture) immediately starts listening,
  // which also unlocks audio autoplay for the spoken replies that follow. Turning it OFF halts both
  // the mic and any in-flight speech.
  const toggleConvo = useCallback(() => {
    const next = !convoModeRef.current;
    convoModeRef.current = next;
    setConvoMode(next);
    if (next) {
      if (voiceSupported && !phaseIsBusy(phaseRef.current)) startListeningRef.current();
    } else {
      stopListening();
      stopSpeaking();
      setPhase("idle");
    }
  }, [voiceSupported, stopListening, stopSpeaking]);

  // The big orb/sphere is the primary push-to-talk control. While Jarvis is speaking, tapping it
  // interrupts and starts a new turn (barge-in); while listening it stops; when idle it listens.
  const onOrbClick = useCallback(() => {
    if (phaseRef.current === "thinking") return;
    if (phaseRef.current === "listening") {
      stopListening();
      return;
    }
    if (phaseRef.current === "speaking") stopSpeaking();
    if (voiceSupported) startListeningRef.current();
  }, [voiceSupported, stopListening, stopSpeaking]);

  const listening = phase === "listening";
  const thinking = phase === "thinking";

  // On the home/hero screen we deliberately show NO explainer when idle — just the orb and the
  // clock. Status text only appears transiently while listening or thinking. Elsewhere (the compact
  // console) the idle line still hints at what Jarvis can do.
  const speakingNow = phase === "speaking";
  const idleStatus = hero
    ? convoMode
      ? "Conversation mode — tap the orb and speak"
      : ""
    : "Ask about your email, calendar, meetings & tasks — or search the web and your files";
  const statusText = thinking
    ? "Thinking…"
    : speakingNow
      ? "Jarvis is speaking…"
      : listening
        ? convoMode
          ? "Listening… speak, then pause (conversation mode)"
          : "Listening… speak, then pause"
        : idleStatus;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center">
      <button
        type="button"
        onClick={onOrbClick}
        disabled={thinking}
        aria-label={listening ? "Stop listening" : "Talk to Jarvis"}
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
      >
        {hero ? <JarvisSphere state={phase} /> : <JarvisOrb state={phase} />}
      </button>

      {hero ? (
        <div className="-mt-2 mb-8 text-center">
          <LiveClock />
          <p className="mt-4 h-5 text-xs text-muted/80">{statusText}</p>
        </div>
      ) : (
        <p className="mb-5 h-5 text-sm text-muted">{statusText}</p>
      )}

      {/* Input — slim and quiet on the home, fuller elsewhere */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
        className={[
          "flex items-center gap-2 rounded-xl border px-3 py-2",
          hero
            ? "w-full max-w-md border-border/60 bg-surface/50"
            : "w-full border-border bg-surface-2",
        ].join(" ")}
      >
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleConvo}
            aria-label={convoMode ? "Turn off conversation mode" : "Start a hands-free conversation"}
            aria-pressed={convoMode}
            title={
              convoMode
                ? "Conversation mode on — speak, pause, and Jarvis replies aloud, then listens again. Click to stop."
                : "Conversation mode: talk hands-free — Jarvis listens, answers aloud, then listens again"
            }
            className={`rounded-lg p-1.5 transition-colors ${
              convoMode ? "bg-accent/15 text-accent" : "text-muted hover:text-accent"
            }`}
          >
            <Headphones className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => (speaking ? stopSpeaking() : toggleSpeech())}
          aria-label={speechOn ? (speaking ? "Stop speaking" : "Mute Jarvis's voice") : "Unmute Jarvis's voice"}
          aria-pressed={speechOn}
          title={speechOn ? "Jarvis speaks replies — click to mute" : "Voice muted — click to unmute"}
          className={`rounded-lg p-1.5 transition-colors ${
            speaking ? "text-accent animate-pulse" : speechOn ? "text-muted hover:text-accent" : "text-muted/50 hover:text-muted"
          }`}
        >
          {speechOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
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
          placeholder="Ask about your day, your inbox, or anything…"
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

      {!hero && !answer && !error && !thinking && (
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
