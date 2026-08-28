/**
 * AI coach conversations.
 *
 * Threads and messages are stored server-side rather than kept in component
 * state, so a conversation survives a refresh, a new device, and the app being
 * closed mid-answer — and so the model can be given real history to work from.
 */

import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, ChatThread } from "@/lib/types/database";

export async function listThreads(
  userId: string,
  limit = 30,
): Promise<ChatThread[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as ChatThread[];
}

export async function createThread(
  userId: string,
  title = "New conversation",
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: userId, title })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not start a conversation." };
  }
  return { ok: true, threadId: data.id };
}

/**
 * The most recent thread, creating one if the user has never chatted.
 *
 * The coach page opens straight into a conversation rather than an empty
 * thread list — a chat UI with nothing in it and no obvious next step reads as
 * broken.
 */
export async function getOrCreateLatestThread(
  userId: string,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const threads = await listThreads(userId, 1);
  if (threads.length > 0) return { ok: true, threadId: threads[0].id };
  return createThread(userId);
}

export async function getMessages(
  threadId: string,
  limit = 200,
): Promise<ChatMessage[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data ?? []) as ChatMessage[];
}

export async function appendMessage(input: {
  threadId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not save the message." };
  }

  // Bumps the thread's updated_at via its trigger, which is what orders the
  // thread list — without it, an active conversation sinks to the bottom.
  await supabase
    .from("chat_threads")
    .update({ id: input.threadId })
    .eq("id", input.threadId);

  return { ok: true, id: data.id };
}

/**
 * Names a thread after its opening question, truncated at a word boundary.
 * Only applied while the title is still the default, so a rename sticks.
 */
export async function titleThreadFromFirstMessage(
  threadId: string,
  firstMessage: string,
): Promise<void> {
  const supabase = await createClient();

  const trimmed = firstMessage.trim().replace(/\s+/g, " ");
  const title =
    trimmed.length <= 60
      ? trimmed
      : `${trimmed.slice(0, trimmed.lastIndexOf(" ", 57) || 57)}…`;

  await supabase
    .from("chat_threads")
    .update({ title })
    .eq("id", threadId)
    .eq("title", "New conversation");
}

export async function deleteThread(
  threadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_threads").delete().eq("id", threadId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
