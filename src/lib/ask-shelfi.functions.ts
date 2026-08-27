import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3.7-flash";
const MAX_CONTEXT_CHARS = 6000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_QUESTION_CHARS = 600;

export type AskShelfiInput = {
  resourceId: string;
  conversationId?: string | null;
  question: string;
  page?: number | null;
  pageText?: string | null;
  selectedText?: string | null;
};

export type AskShelfiReply = {
  conversationId: string;
  answer: string;
  usedBookContext: boolean;
};

const UUID = /^[0-9a-f-]{36}$/i;

/** A friendly error the reader panel can show verbatim. */
function friendly(message: string): Error {
  return new Error(message);
}

/**
 * Ask Shelfi — contextual reading assistant.
 *
 * Identity (user, school) is derived from the verified session, never from the
 * client. Book access is re-checked in the database through the caller's own
 * session using the existing `can_open_digital_resource` authorization, so this
 * cannot be used to reach another school's private books. The AI key stays on
 * the server; the browser never sees it.
 */
export const askShelfi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AskShelfiInput) => {
    const resourceId = String(data?.resourceId ?? "").trim();
    if (!UUID.test(resourceId)) throw friendly("We couldn't identify this book.");

    const question = String(data?.question ?? "").trim();
    if (!question) throw friendly("Type a question first.");

    const conversationId = data?.conversationId ? String(data.conversationId).trim() : null;
    if (conversationId && !UUID.test(conversationId)) {
      throw friendly("We couldn't find that conversation.");
    }

    const page = Number.isFinite(Number(data?.page)) ? Math.max(1, Number(data?.page)) : null;

    return {
      resourceId,
      conversationId,
      question: question.slice(0, MAX_QUESTION_CHARS),
      page,
      pageText: (data?.pageText ?? "").toString().slice(0, MAX_CONTEXT_CHARS).trim() || null,
      selectedText: (data?.selectedText ?? "").toString().slice(0, 1200).trim() || null,
    };
  })
  .handler(async ({ data, context }): Promise<AskShelfiReply> => {
    const { supabase, userId } = context;

    // 1. Active school membership, from server-trusted state.
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, status")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.school_id || profile.status !== "active") {
      throw friendly("Ask Shelfi is available once your school membership is approved.");
    }

    // 2. Book authorization, decided in the database as this user.
    const { data: allowed, error: rpcError } = await supabase.rpc("can_open_digital_resource", {
      _resource_id: data.resourceId,
    });
    if (rpcError) throw friendly("We couldn't check your access to this book.");
    if (!allowed) throw friendly("You don't have access to this book.");

    const { data: resource } = await supabase
      .from("digital_resources")
      .select("id, title, subject, level")
      .eq("id", data.resourceId)
      .maybeSingle();
    if (!resource) throw friendly("We couldn't find this book.");

    // 3. Conversation — ownership is enforced by row-level security.
    let conversationId = data.conversationId;
    if (conversationId) {
      const { data: existing } = await supabase
        .from("ai_conversations")
        .select("id, resource_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!existing || existing.resource_id !== data.resourceId) {
        throw friendly("We couldn't find that conversation.");
      }
    } else {
      const { data: created, error } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: userId,
          school_id: profile.school_id,
          resource_id: data.resourceId,
        })
        .select("id")
        .single();
      if (error || !created) throw friendly("We couldn't start this conversation.");
      conversationId = created.id;
    }

    // 4. Short recent history only — keeps requests small.
    const { data: history } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);

    const priorTurns = (history ?? [])
      .slice()
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // 5. Book context: only the passage the student is actually looking at.
    const usedBookContext = Boolean(data.pageText || data.selectedText);
    const contextParts: string[] = [];
    if (data.selectedText) contextParts.push(`Text the student highlighted:\n${data.selectedText}`);
    if (data.pageText) {
      contextParts.push(`Text on page ${data.page ?? "?"} of the book:\n${data.pageText}`);
    }

    const system = [
      "You are Ask Shelfi, a reading companion inside a school library app.",
      "You only help students understand the book they are currently reading:",
      `"${resource.title}"${resource.subject ? ` (${resource.subject})` : ""}${resource.level ? `, ${resource.level}` : ""}.`,
      "Explain clearly in warm, age-appropriate language. Keep answers short — usually 2-5 sentences — and use a simple list only when it genuinely helps.",
      "Ground your answer in the book passage provided. Never invent plot points, characters, facts or quotations that are not in the passage.",
      "If the passage does not contain the answer, say so plainly and offer what you can from general knowledge, clearly flagged as general.",
      "Do not say 'according to the book' repeatedly; just explain naturally.",
      "Politely decline anything unrelated to reading and understanding this book — you are not a general chatbot, homework service or tutor for other subjects.",
      usedBookContext
        ? "The student's current passage is included below."
        : "No book text is available for this page, so tell the student you cannot see this page's text and answer only in general terms.",
    ].join(" ");

    const messages = [
      { role: "system", content: system },
      ...(contextParts.length
        ? [{ role: "system" as const, content: contextParts.join("\n\n") }]
        : []),
      ...priorTurns,
      { role: "user" as const, content: data.question },
    ];

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw friendly("Ask Shelfi isn't configured yet. Please contact your school.");

    let answer = "";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({ model: MODEL, messages, max_tokens: 600 }),
      });

      if (!res.ok) {
        await logUsage(supabase, {
          userId,
          schoolId: profile.school_id,
          resourceId: data.resourceId,
          status: `error_${res.status}`,
        });
        if (res.status === 429) {
          throw friendly("Ask Shelfi is busy right now. Please try again in a moment.");
        }
        if (res.status === 402 || res.status === 403) {
          throw friendly("Ask Shelfi is temporarily unavailable at your school.");
        }
        throw friendly("Ask Shelfi couldn't answer just now. Please try again.");
      }

      const payload = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      answer = payload.choices?.[0]?.message?.content?.trim() ?? "";
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Ask Shelfi")) throw error;
      if (error instanceof Error && /try again|busy|unavailable/i.test(error.message)) throw error;
      throw friendly("We couldn't reach Ask Shelfi. Check your connection and try again.");
    }

    if (!answer) throw friendly("Ask Shelfi couldn't answer that. Try rephrasing your question.");

    await supabase.from("ai_messages").insert([
      { conversation_id: conversationId, role: "user", content: data.question },
      { conversation_id: conversationId, role: "assistant", content: answer },
    ]);
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    await logUsage(supabase, {
      userId,
      schoolId: profile.school_id,
      resourceId: data.resourceId,
      status: "ok",
    });

    return { conversationId, answer, usedBookContext };
  });

type UsageArgs = {
  userId: string;
  schoolId: string;
  resourceId: string;
  status: string;
};

/** Lightweight usage trail so limits/reporting can be added later. */
async function logUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: UsageArgs,
): Promise<void> {
  try {
    await supabase.from("ai_usage_events").insert({
      user_id: args.userId,
      school_id: args.schoolId,
      resource_id: args.resourceId,
      model: MODEL,
      status: args.status,
    });
  } catch {
    /* usage logging must never break a student's question */
  }
}
