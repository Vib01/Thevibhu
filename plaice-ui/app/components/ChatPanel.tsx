"use client";

import { useState } from "react";
import type { MaturityPoint } from "../api/maturity-curve/route";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPanel({ cohort, points }: { cohort: number; points: MaturityPoint[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    setError(null);

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          cohort,
          points: points.map(({ age, probability, lower, upper, ciReliable }) => ({
            age,
            probability,
            lower,
            upper,
            ciReliable,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-full rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Ask about this result</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Answers cite the confidence interval for anything they quote from the chart.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-[16rem] max-h-[28rem]">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500">
            e.g. &ldquo;Why is this cohort maturing later?&rdquo; or &ldquo;How confident is the model at age 6?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-indigo-600 text-white"
                : "self-start bg-zinc-100 dark:bg-zinc-900"
            }`}
          >
            {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-zinc-200 dark:border-zinc-800 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this cohort..."
          disabled={streaming}
          className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-full bg-foreground text-background px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
