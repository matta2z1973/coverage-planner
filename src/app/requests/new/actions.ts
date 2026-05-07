"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  cohorts,
  coverageRequests,
  coverageSlots,
  coverageFiles,
} from "@/lib/db/schema";

const dayTypeEnum = z.enum(["green", "gold", "a_day", "b_day", "c_day"]);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const fileInput = z.object({
  storagePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
});

const slotInput = z.object({
  cohortId: z.string().uuid(),
  date: z.string().regex(dateRe),
  dayType: dayTypeEnum,
  dayNumber: z.number().int().min(1).max(8).nullable(),
  blockLabel: z.string().min(1).max(60),
  courseTitle: z.string().trim().min(1, "Course title is required").max(200),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  curriculumText: z.string().max(4000).optional().nullable(),
  curriculumUrl: z.union([z.string().url().max(1000), z.literal("")]).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  files: z.array(fileInput).max(20).optional().default([]),
});

const requestInput = z.object({
  absentTeacherName: z.string().trim().min(1).max(120),
  absentTeacherEmail: z
    .union([z.string().email().max(200), z.literal("")])
    .optional()
    .nullable(),
  slots: z.array(slotInput).min(1, "Pick at least one block to cover"),
});

const normalizeTime = (s: string) => (s.length === 5 ? `${s}:00` : s);

export type CreateRequestState =
  | { phase: "idle" }
  | { phase: "error"; message: string }
  | { phase: "saved"; requestId: string; slotCount: number };

export async function createRequest(
  _prev: CreateRequestState | undefined,
  formData: FormData,
): Promise<CreateRequestState> {
  const user = await requireUser();

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { phase: "error", message: "Missing form payload." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { phase: "error", message: "Form payload was not valid JSON." };
  }

  const result = requestInput.safeParse(parsed);
  if (!result.success) {
    return {
      phase: "error",
      message: result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }

  const { absentTeacherName, absentTeacherEmail: rawEmail, slots } = result.data;

  // Faculty can only post for themselves: ignore whatever they send and snap
  // both name and email to the current user. Admins can target anyone.
  const absentTeacherEmail =
    user.role === "admin" ? (rawEmail || null) : user.email;
  const finalName =
    user.role === "admin" ? absentTeacherName : (user.fullName ?? user.email);

  // Validate every referenced cohort exists.
  const referencedCohorts = [...new Set(slots.map((s) => s.cohortId))];
  const foundCohorts = await db
    .select({ id: cohorts.id })
    .from(cohorts)
    .where(inArray(cohorts.id, referencedCohorts));
  if (foundCohorts.length !== referencedCohorts.length) {
    return { phase: "error", message: "One or more cohorts were invalid." };
  }

  // De-duplicate slots within the request (same cohort+date+blockLabel).
  const seen = new Set<string>();
  const unique = slots.filter((s) => {
    const k = `${s.cohortId}|${s.date}|${s.blockLabel}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  let requestId = "";
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(coverageRequests)
        .values({
          createdBy: user.id,
          absentTeacherName: finalName,
          absentTeacherEmail,
        })
        .returning({ id: coverageRequests.id });
      requestId = created.id;

      const insertedSlots = await tx
        .insert(coverageSlots)
        .values(
          unique.map((s) => ({
            requestId: created.id,
            cohortId: s.cohortId,
            date: s.date,
            dayType: s.dayType,
            dayNumber: s.dayNumber,
            blockLabel: s.blockLabel,
            courseTitle: s.courseTitle,
            startTime: normalizeTime(s.startTime),
            endTime: normalizeTime(s.endTime),
            status: "open" as const,
            curriculumText: s.curriculumText || null,
            curriculumUrl: s.curriculumUrl || null,
            notes: s.notes || null,
          })),
        )
        .returning({
          id: coverageSlots.id,
          cohortId: coverageSlots.cohortId,
          date: coverageSlots.date,
          blockLabel: coverageSlots.blockLabel,
        });

      // Build a key → slotId map so we can attach files to the correct slot.
      const keyToSlotId = new Map(
        insertedSlots.map((s) => [`${s.cohortId}|${s.date}|${s.blockLabel}`, s.id]),
      );

      const fileRows: Array<{
        slotId: string;
        requestId: string;
        storagePath: string;
        fileName: string;
      }> = [];
      for (const s of unique) {
        const slotId = keyToSlotId.get(`${s.cohortId}|${s.date}|${s.blockLabel}`);
        if (!slotId) continue;
        for (const f of s.files ?? []) {
          fileRows.push({
            slotId,
            requestId: created.id,
            storagePath: f.storagePath,
            fileName: f.fileName,
          });
        }
      }
      if (fileRows.length > 0) {
        await tx.insert(coverageFiles).values(fileRows);
      }
    });
  } catch (err) {
    return {
      phase: "error",
      message: err instanceof Error ? err.message : "Failed to save request.",
    };
  }

  revalidatePath("/");
  redirect(`/requests/${requestId}`);
}
