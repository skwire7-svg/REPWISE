"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createThread, deleteThread } from "@/lib/db/coach";

export async function newThreadAction(): Promise<
  { ok: true; threadId: string } | { ok: false; error: string }
> {
  const user = await requireUser();
  const result = await createThread(user.id);
  if (result.ok) revalidatePath("/coach");
  return result;
}

export async function deleteThreadAction(
  threadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  const result = await deleteThread(threadId);
  if (result.ok) revalidatePath("/coach");
  return result;
}
