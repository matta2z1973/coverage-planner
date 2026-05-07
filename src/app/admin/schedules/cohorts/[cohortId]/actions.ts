"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockTemplates, cohorts } from "@/lib/db/schema";

const dayTypeEnum = z.enum(["green", "gold", "a_day", "b_day", "c_day"]);

const blockSchema = z.object({
  dayType: dayTypeEnum,
  dayNumber: z.number().int().min(1).max(8).nullable(),
  label: z.string().min(1).max(60),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  sortOrder: z.number().int().min(0),
  isCoverable: z.boolean(),
});

const normalizeTime = (s: string) => (s.length === 5 ? `${s}:00` : s);

export type SaveCohortState =
  | { phase: "idle" }
  | { phase: "saved"; total: number }
  | { phase: "error"; message: string };

export async function saveCohortBlocks(
  _prev: SaveCohortState | undefined,
  formData: FormData,
): Promise<SaveCohortState> {
  await requireAdmin();

  const cohortId = formData.get("cohortId");
  const payload = formData.get("blocks");
  if (typeof cohortId !== "string") {
    return { phase: "error", message: "Missing cohortId." };
  }
  if (typeof payload !== "string") {
    return { phase: "error", message: "Missing block data." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { phase: "error", message: "Block data was not valid JSON." };
  }

  const blocks = z.array(blockSchema).safeParse(parsed);
  if (!blocks.success) {
    return {
      phase: "error",
      message: blocks.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }

  const [cohort] = await db
    .select()
    .from(cohorts)
    .where(eq(cohorts.id, cohortId))
    .limit(1);
  if (!cohort) {
    return { phase: "error", message: "Cohort not found." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(blockTemplates)
        .where(eq(blockTemplates.cohortId, cohortId));
      if (blocks.data.length > 0) {
        await tx.insert(blockTemplates).values(
          blocks.data.map((b, i) => ({
            cohortId,
            dayType: b.dayType,
            dayNumber: b.dayNumber,
            label: b.label,
            startTime: normalizeTime(b.startTime),
            endTime: normalizeTime(b.endTime),
            sortOrder: i,
            isCoverable: b.isCoverable,
          })),
        );
      }
    });
  } catch (err) {
    return {
      phase: "error",
      message: err instanceof Error ? err.message : "Save failed.",
    };
  }

  revalidatePath("/admin/schedules");
  revalidatePath(`/admin/schedules/cohorts/${cohortId}`);
  return { phase: "saved", total: blocks.data.length };
}
