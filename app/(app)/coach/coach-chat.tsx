"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, SendHorizonal, Trash2 } from "lucide-react";
import { deleteThreadAction, newThreadAction } from "./actions";

interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/**
 * Strips the markdown the model still reaches for out of habit.
 *
 * Replies render as plain text, so a stray `**` shows up literally as asterisks
 * around the words it was meant to embolden. The system prompt asks for prose
 * without markup, but instructions alone aren't reliable enough to put in front
 * of a user — this is the guarantee. It also cleans up messages saved before
 * the prompt changed, since it runs at render rather than on write.
 */
function humanize(text: string): string {
  return (
    text
      // **bold** / __bold__ / *italic* / _italic_ — markers only, keep the words
      .replace(/\*\*(.+?)\*\*/gs, "$1")
      .replace(/__(.+?)__/gs, "$1")
      .replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/gs, "$1")
      // ### headings
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      // Bullets become a single clean character instead of * or - soup
      .replace(/^\s{0,3}[*-]\s+/gm, "• ")
      // `code` fences and inline ticks add nothing in a coaching reply
      .replace(/```[a-z]*\n?/gi, "")
      .replace(/`([^`]+)`/g, "$1")
      // Any asterisks that survived the pairs above (unclosed bold, literal **)
      .replace(/\*/g, "")
      // Three or more blank lines collapse to one gap
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Three pulsing dots while the reply is still being composed.
 *
 * Replaces a static "Thinking…": the route does several database round trips
 * and waits on time-to-first-token before any text arrives, and a caption that
 * never changes during that gap reads as a page that has hung. The global
 * reduced-motion rule in globals.css stills these automatically, leaving the
 * dots visible but static, so the state is still legible without movement.
 */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Coach is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

const SUGGESTIONS = [
  "Should I add weight to my bench next session?",
  "Swap an exercise I can't do today",
  "Is my protein target high enough?",
  "How do I fix my squat depth?",
];

export function CoachChat({
  threadId,
  threads,
  initialMessages,
}: {
  threadId: string;
  threads: Array<{ id: string; title: string }>;
  initialMessages: ChatMessageView[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Mirrors `streaming` in a ref so the props-sync effect below can read it
  // without listing it as a dependency (which would re-run the effect — and
  // wipe the messages — the instant a send starts).
  const streamingRef = useRef(false);

  // Switching threads swaps the server-rendered messages in; without this the
  // previous conversation stays on screen under the new thread's title.
  //
  // The guard is what keeps your own message on screen after you hit send.
  // `initialMessages` is a fresh array on every parent render, so this effect
  // fires whenever anything re-renders the page — and it used to overwrite the
  // optimistic user turn with the server's copy, which doesn't exist yet. The
  // message only reappeared once the reply landed and triggered a refresh.
  // While a turn is in flight the local list is the source of truth; the sync
  // resumes afterwards, when router.refresh() brings back the real ids.
  useEffect(() => {
    if (streamingRef.current) return;
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError(null);
    setInput("");
    setStreaming(true);
    // Set synchronously, before the first await, so the props-sync effect can
    // never observe a send as "not in flight" and clobber the optimistic turn.
    streamingRef.current = true;

    // Optimistic user turn plus an empty assistant bubble the stream fills in,
    // so the answer appears to type rather than arriving all at once.
    const userMessage: ChatMessageView = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const assistantId = `local-assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: trimmed }),
      });

      if (!response.ok || !response.body) {
        const detail = await response
          .json()
          .then((body: { error?: string }) => body.error)
          .catch(() => null);
        throw new Error(detail ?? "The coach is unavailable right now.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        );
      }

      // The server has now saved both turns. Refreshing re-reads them with
      // their real ids and picks up the auto-generated thread title.
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      // Drop the empty assistant bubble — leaving it looks like the coach
      // replied with silence.
      setMessages((prev) =>
        prev.filter((message) => !(message.id === assistantId && !message.content)),
      );
    } finally {
      setStreaming(false);
      streamingRef.current = false;
    }
  }

  function handleNewThread() {
    startTransition(async () => {
      const result = await newThreadAction();
      if (result.ok) router.push(`/coach?thread=${result.threadId}`);
    });
  }

  function handleDeleteThread() {
    startTransition(async () => {
      const result = await deleteThreadAction(threadId);
      if (result.ok) router.push("/coach");
    });
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">AI coach</h1>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleNewThread}
            aria-label="New conversation"
            className="rounded-md p-2 text-muted transition-colors hover:text-accent"
          >
            <MessageSquarePlus className="h-5 w-5" aria-hidden />
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteThread}
              aria-label="Delete this conversation"
              className="rounded-md p-2 text-muted transition-colors hover:text-danger"
            >
              <Trash2 className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {threads.length > 1 && (
        <select
          className="field mt-3"
          value={threadId}
          onChange={(event) => router.push(`/coach?thread=${event.target.value}`)}
          aria-label="Choose a conversation"
        >
          {threads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title}
            </option>
          ))}
        </select>
      )}

      <div className="mt-4 flex-1 space-y-3">
        {messages.length === 0 ? (
          <div className="card p-5">
            <p className="text-sm text-muted">
              Ask anything about your training, form or nutrition. The coach can
              see your profile, plan and recent sessions.
            </p>
            <ul className="mt-4 space-y-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => send(suggestion)}
                    className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-sm transition-colors hover:border-accent"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : "flex"}
            >
              <div
                className={
                  message.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white"
                    : "max-w-[90%] rounded-2xl rounded-bl-sm border border-line bg-surface px-4 py-2.5 text-sm leading-relaxed"
                }
              >
                {message.content ? (
                  <span className="whitespace-pre-wrap">
                    {message.role === "assistant"
                      ? humanize(message.content)
                      : message.content}
                  </span>
                ) : (
                  <TypingDots />
                )}
              </div>
            </div>
          ))
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="sticky bottom-20 mt-4 flex items-end gap-2 bg-ink/90 py-2 backdrop-blur"
      >
        <textarea
          className="field max-h-32 min-h-11 flex-1 resize-none py-2.5"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line — the convention every
            // chat app uses, and on mobile the on-screen keyboard's return key
            // still inserts a newline because it doesn't fire this.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask your coach…"
          rows={1}
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="btn-primary shrink-0"
          aria-label="Send"
        >
          <SendHorizonal className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
