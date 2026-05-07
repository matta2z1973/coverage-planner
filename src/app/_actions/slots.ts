"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  coverageSlots,
  coverageRequests,
  coverageFiles,
} from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function loadSlotForEdit(slotId: string) {
  // Internal tool: any authenticated user (the caller has already been
  // authenticated upstream) is allowed to edit curriculum/notes. The only
  // gate here is that the slot exists.
  const [row] = await db
    .select({
      slotId: coverageSlots.id,
      requestId: coverageSlots.requestId,
    })
    .from(coverageSlots)
    .where(eq(coverageSlots.id, slotId))
    .limit(1);
  if (!row) return { ok: false as const, message: "Slot not found." };
  return { ok: true as const, requestId: row.requestId };
}

export type SlotActionState =
  | { phase: "idle" }
  | { phase: "ok"; message: string }
  | { phase: "error"; message: string };

export async function claimSlot(
  _prev: SlotActionState | undefined,
  formData: FormData,
): Promise<SlotActionState> {
  const user = await requireUser();
  const slotId = formData.get("slotId");
  if (typeof slotId !== "string") {
    return { phase: "error", message: "Missing slot id." };
  }

  // Atomic update: only succeeds if the slot is still open.
  const result = await db
    .update(coverageSlots)
    .set({
      status: "claimed",
      claimedByUserId: user.id,
      claimedAt: new Date(),
    })
    .where(and(eq(coverageSlots.id, slotId), eq(coverageSlots.status, "open")))
    .returning({ id: coverageSlots.id, requestId: coverageSlots.requestId });

  if (result.length === 0) {
    return {
      phase: "error",
      message: "That block is no longer available.",
    };
  }

  revalidatePath("/open");
  revalidatePath("/my-coverage");
  revalidatePath(`/requests/${result[0].requestId}`);
  return { phase: "ok", message: "Claimed." };
}

export async function releaseSlot(
  _prev: SlotActionState | undefined,
  formData: FormData,
): Promise<SlotActionState> {
  const user = await requireUser();
  const slotId = formData.get("slotId");
  if (typeof slotId !== "string") {
    return { phase: "error", message: "Missing slot id." };
  }

  // Admins can release any slot; everyone else can only release their own.
  const conditions =
    user.role === "admin"
      ? and(eq(coverageSlots.id, slotId), eq(coverageSlots.status, "claimed"))
      : and(
          eq(coverageSlots.id, slotId),
          eq(coverageSlots.status, "claimed"),
          eq(coverageSlots.claimedByUserId, user.id),
        );

  const result = await db
    .update(coverageSlots)
    .set({
      status: "open",
      claimedByUserId: null,
      claimedAt: null,
    })
    .where(conditions)
    .returning({ id: coverageSlots.id, requestId: coverageSlots.requestId });

  if (result.length === 0) {
    return {
      phase: "error",
      message: "Couldn't release this block (not yours, or already open).",
    };
  }

  revalidatePath("/open");
  revalidatePath("/my-coverage");
  revalidatePath(`/requests/${result[0].requestId}`);
  return { phase: "ok", message: "Released." };
}

const detailsSchema = z.object({
  slotId: z.string().uuid(),
  courseTitle: z.string().trim().min(1, "Course title is required").max(200),
  curriculumText: z.string().max(4000),
  curriculumUrl: z.union([z.string().url().max(1000), z.literal("")]),
  notes: z.string().max(2000),
});

export async function updateSlotDetails(
  _prev: SlotActionState | undefined,
  formData: FormData,
): Promise<SlotActionState> {
  await requireUser();
  const parsed = detailsSchema.safeParse({
    slotId: formData.get("slotId"),
    courseTitle: formData.get("courseTitle") ?? "",
    curriculumText: formData.get("curriculumText") ?? "",
    curriculumUrl: formData.get("curriculumUrl") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return {
      phase: "error",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }

  const guard = await loadSlotForEdit(parsed.data.slotId);
  if (!guard.ok) return { phase: "error", message: guard.message };

  await db
    .update(coverageSlots)
    .set({
      courseTitle: parsed.data.courseTitle,
      curriculumText: parsed.data.curriculumText.trim() || null,
      curriculumUrl: parsed.data.curriculumUrl.trim() || null,
      notes: parsed.data.notes.trim() || null,
    })
    .where(eq(coverageSlots.id, parsed.data.slotId));

  revalidatePath("/open");
  revalidatePath("/my-coverage");
  revalidatePath(`/requests/${guard.requestId}`);
  return { phase: "ok", message: "Saved." };
}

const addFileSchema = z.object({
  slotId: z.string().uuid(),
  storagePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
});

export async function addSlotFile(
  _prev: SlotActionState | undefined,
  formData: FormData,
): Promise<SlotActionState> {
  await requireUser();
  const parsed = addFileSchema.safeParse({
    slotId: formData.get("slotId"),
    storagePath: formData.get("storagePath"),
    fileName: formData.get("fileName"),
  });
  if (!parsed.success) {
    return { phase: "error", message: "Invalid file data." };
  }

  const guard = await loadSlotForEdit(parsed.data.slotId);
  if (!guard.ok) return { phase: "error", message: guard.message };

  await db.insert(coverageFiles).values({
    slotId: parsed.data.slotId,
    requestId: guard.requestId,
    storagePath: parsed.data.storagePath,
    fileName: parsed.data.fileName,
  });

  revalidatePath(`/requests/${guard.requestId}`);
  revalidatePath("/open");
  revalidatePath("/my-coverage");
  return { phase: "ok", message: "Added." };
}

const removeFileSchema = z.object({
  fileId: z.string().uuid(),
});

export async function removeSlotFile(
  _prev: SlotActionState | undefined,
  formData: FormData,
): Promise<SlotActionState> {
  await requireUser();
  const parsed = removeFileSchema.safeParse({
    fileId: formData.get("fileId"),
  });
  if (!parsed.success) {
    return { phase: "error", message: "Invalid file id." };
  }

  // Look up the file so we can clean up the blob too.
  const [fileRow] = await db
    .select({
      id: coverageFiles.id,
      slotId: coverageFiles.slotId,
      storagePath: coverageFiles.storagePath,
      requestId: coverageRequests.id,
    })
    .from(coverageFiles)
    .leftJoin(coverageSlots, eq(coverageSlots.id, coverageFiles.slotId))
    .leftJoin(
      coverageRequests,
      eq(coverageRequests.id, coverageSlots.requestId),
    )
    .where(eq(coverageFiles.id, parsed.data.fileId))
    .limit(1);
  if (!fileRow) {
    return { phase: "error", message: "File not found." };
  }

  await db.delete(coverageFiles).where(eq(coverageFiles.id, parsed.data.fileId));

  // Best-effort cleanup of the actual blob.
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.storage.from("curriculum").remove([fileRow.storagePath]);
  } catch {
    // Ignore — DB row already removed; orphan blob is acceptable.
  }

  if (fileRow.requestId) {
    revalidatePath(`/requests/${fileRow.requestId}`);
  }
  revalidatePath("/open");
  revalidatePath("/my-coverage");
  return { phase: "ok", message: "Removed." };
}
