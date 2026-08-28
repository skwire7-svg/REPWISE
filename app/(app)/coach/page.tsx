import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getMessages, getOrCreateLatestThread, listThreads } from "@/lib/db/coach";
import { getProfile } from "@/lib/db/profile";
import { isCompleteProfile } from "@/lib/types/database";
import { CoachChat } from "./coach-chat";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const user = await requireUser();

  const profile = await getProfile(user.id);
  if (!profile || !isCompleteProfile(profile)) redirect("/onboarding");

  const { thread: requestedThread } = await searchParams;

  const threads = await listThreads(user.id);

  // Only honour a ?thread= that is actually one of this user's threads. RLS
  // would block the messages anyway, but resolving it here means a stale or
  // tampered link opens the real conversation instead of an empty shell.
  const activeId = threads.some((t) => t.id === requestedThread)
    ? requestedThread!
    : await (async () => {
        const result = await getOrCreateLatestThread(user.id);
        return result.ok ? result.threadId : null;
      })();

  if (!activeId) {
    return (
      <p className="card p-4 text-sm text-danger">
        Could not open a conversation. Check that the database schema has been
        applied.
      </p>
    );
  }

  const messages = await getMessages(activeId);

  return (
    <CoachChat
      threadId={activeId}
      threads={threads.map((t) => ({ id: t.id, title: t.title }))}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      }))}
    />
  );
}
