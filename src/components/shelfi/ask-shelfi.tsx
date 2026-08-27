import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, X } from "lucide-react";
import { askShelfi } from "@/lib/ask-shelfi.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AskMessage = { id: string; role: "user" | "assistant"; content: string };

const STARTERS = [
  "Explain this section",
  "What does this mean?",
  "Summarise this page",
  "Explain it simply",
];

export function AskShelfiPanel({
  resourceId,
  bookTitle,
  page,
  getPageText,
  onClose,
  className,
}: {
  resourceId: string;
  bookTitle: string;
  page: number;
  getPageText: () => Promise<string | null>;
  onClose: () => void;
  className?: string | undefined;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const ask = useServerFn(askShelfi);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [contextWarning, setContextWarning] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Existing conversation for this student + book (own rows only, by RLS).
  const thread = useQuery({
    queryKey: ["shelfi", "ask", session?.id, resourceId],
    enabled: Boolean(session?.id),
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string | null; messages: AskMessage[] }> => {
      const { data: conv } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("resource_id", resourceId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conv) return { id: null, messages: [] };
      const { data: msgs } = await supabase
        .from("ai_messages")
        .select("id, role, content")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(40);
      return {
        id: conv.id,
        messages: (msgs ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      };
    },
  });

  useEffect(() => {
    if (thread.data?.id && !conversationId) setConversationId(thread.data.id);
  }, [thread.data?.id, conversationId]);

  const [pending, setPending] = useState<AskMessage[]>([]);
  const messages = [...(thread.data?.messages ?? []), ...pending];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const pageText = await getPageText().catch(() => null);
      setContextWarning(!pageText);
      const selection = typeof window !== "undefined" ? window.getSelection()?.toString() : "";
      return ask({
        data: {
          resourceId,
          conversationId,
          question: text,
          page,
          pageText,
          selectedText: selection?.trim() ? selection.trim() : null,
        },
      });
    },
    onMutate: (text) => {
      setError(null);
      setPending((p) => [...p, { id: `local-${Date.now()}`, role: "user", content: text }]);
    },
    onSuccess: async (reply) => {
      setConversationId(reply.conversationId);
      setPending((p) => [
        ...p,
        { id: `local-${Date.now()}-a`, role: "assistant", content: reply.answer },
      ]);
      await queryClient.invalidateQueries({
        queryKey: ["shelfi", "ask", session?.id, resourceId],
      });
      setPending([]);
    },
    onError: (e) => {
      setPending((p) => p.slice(0, -1));
      setError(
        (e as Error)?.message?.replace(/^Error:\s*/, "") ??
          "Ask Shelfi couldn't answer just now. Please try again.",
      );
    },
  });

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setQuestion("");
    send.mutate(trimmed);
  }

  return (
    <aside
      className={cn("flex min-h-0 flex-col border-border bg-card", className)}
      aria-label="Ask Shelfi"
    >
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-foreground">Ask Shelfi</p>
          <p className="truncate text-xs text-muted-foreground">
            You&rsquo;re reading: <span className="text-foreground">{bookTitle}</span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Close Ask Shelfi"
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {thread.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-sm text-foreground">
              Ask me about page {page} of this book — a word, a paragraph, or the main idea.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              I read the page you&rsquo;re on, so keep questions about this book.
            </p>
          </div>
        ) : null}

        {(thread.data?.messages.length ?? 0) > 0 ? (
          <p className="text-center text-[11px] text-muted-foreground">
            Continuing your earlier conversation about this book
          </p>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "border border-border bg-background text-foreground",
            )}
          >
            {m.content.split("\n").map((line, i) => (
              <p key={i} className={i > 0 ? "mt-2" : undefined}>
                {line}
              </p>
            ))}
          </div>
        ))}

        {send.isPending ? (
          <div className="w-40 rounded-2xl border border-border bg-background px-3.5 py-3">
            <Skeleton className="h-3 w-24" />
          </div>
        ) : null}

        {contextWarning && !send.isPending ? (
          <p className="text-xs text-muted-foreground">
            I couldn&rsquo;t read the text on this page, so that answer was general rather than
            from the book.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-foreground">
            {error}
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <div className="border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={send.isPending}
              onClick={() => submit(s)}
              className="min-h-9 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this page…"
            rows={1}
            className="max-h-32 min-h-11 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Send question"
            disabled={send.isPending || !question.trim()}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </aside>
  );
}
